import { disconnectQueues } from "@/src/__tests__/test-utils";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 } from "uuid";
import waitForExpect from "wait-for-expect";

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  return { project, org, session, ctx, caller };
}

describe("prompts trpc", () => {
  afterAll(async () => {
    await disconnectQueues();
  });
  describe("prompts.setLabels", () => {
    it("should set labels on a prompt and remove them from other versions", async () => {
      const { project, caller } = await prepare();

      // Create trigger for prompt updates
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["updated"],
          filter: [],
          status: "ACTIVE",
        },
      });

      // Create webhook action
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/prompt-labels-webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
          },
        },
      });

      // Link trigger to action
      await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Prompt Labels Automation",
        },
      });

      // Create test prompts with different versions
      const prompt1 = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt",
          version: 1,
          type: "text",
          prompt: { text: "Hello world v1" },
          createdBy: "test-user",
          labels: ["production"],
        },
      });

      const prompt2 = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt",
          version: 2,
          type: "text",
          prompt: { text: "Hello world v2" },
          createdBy: "test-user",
          labels: ["latest"],
        },
      });

      // Set "production" label on prompt2, which should remove it from prompt1
      await caller.prompts.setLabels({
        projectId: project.id,
        promptId: prompt2.id,
        labels: ["production", "latest"],
      });

      // Verify that prompt1 no longer has the "production" label
      const updatedPrompt1 = await prisma.prompt.findUnique({
        where: { id: prompt1.id },
      });
      expect(updatedPrompt1?.labels).not.toContain("production");

      // Verify that prompt2 has both labels
      const updatedPrompt2 = await prisma.prompt.findUnique({
        where: { id: prompt2.id },
      });
      expect(updatedPrompt2?.labels).toEqual(
        expect.arrayContaining(["production", "latest"]),
      );

      await waitForExpect(async () => {
        const executions = await prisma.automationExecution.findMany({
          where: {
            projectId: project.id,
            triggerId: trigger.id,
            actionId: action.id,
          },
        });

        expect(executions).toHaveLength(2);
        expect(executions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sourceId: prompt1.id,
              status: "PENDING",
            }),
            expect.objectContaining({
              sourceId: prompt2.id,
              status: "PENDING",
            }),
          ]),
        );
      });
    });
  });

  describe("prompts.updateTags", () => {
    it("should update tags on all versions of a prompt", async () => {
      const { project, caller } = await prepare();

      // Create trigger for prompt updates
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["updated"],
          filter: [],
          status: "ACTIVE",
        },
      });

      // Create webhook action
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/prompt-labels-webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
          },
        },
      });

      // Link trigger to action
      await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Prompt Tags Automation",
        },
      });

      // Create test prompts with different versions but same name
      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt-tags",
          version: 1,
          type: "text",
          prompt: { text: "Hello world v1" },
          createdBy: "test-user",
          tags: ["old-tag"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt-tags",
          version: 2,
          type: "text",
          prompt: { text: "Hello world v2" },
          createdBy: "test-user",
          tags: ["old-tag"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt-tags",
          version: 3,
          type: "text",
          prompt: { text: "Hello world v3" },
          createdBy: "test-user",
          tags: ["old-tag"],
        },
      });

      // Update tags for all versions of the prompt
      await caller.prompts.updateTags({
        projectId: project.id,
        name: "test-prompt-tags",
        tags: ["new-tag", "updated-tag"],
      });

      // Verify that all versions now have the new tags
      const updatedPrompts = await prisma.prompt.findMany({
        where: {
          projectId: project.id,
          name: "test-prompt-tags",
        },
        orderBy: { version: "asc" },
      });

      expect(updatedPrompts).toHaveLength(3);
      updatedPrompts.forEach((prompt) => {
        expect(prompt.tags).toEqual(
          expect.arrayContaining(["new-tag", "updated-tag"]),
        );
        expect(prompt.tags).not.toContain("old-tag");
      });

      await waitForExpect(async () => {
        const executions = await prisma.automationExecution.findMany({
          where: {
            projectId: project.id,
            triggerId: trigger.id,
            actionId: action.id,
          },
        });
        expect(executions).toHaveLength(3);
        expect(executions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sourceId: updatedPrompts[0].id,
              status: "PENDING",
            }),
            expect.objectContaining({
              sourceId: updatedPrompts[1].id,
              status: "PENDING",
            }),
            expect.objectContaining({
              sourceId: updatedPrompts[2].id,
              status: "PENDING",
            }),
          ]),
        );
      });
    });
  });

  describe("prompts.delete", () => {
    it("should delete all versions of a prompt", async () => {
      const { project, caller } = await prepare();

      // Create trigger for prompt deletions
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["deleted"],
          filter: [],
          status: "ACTIVE",
        },
      });

      // Create webhook action
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/prompt-delete-webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
          },
        },
      });

      // Link trigger to action
      await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Prompt Delete Automation",
        },
      });

      // Create test prompts with multiple versions
      const prompt1 = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt-delete",
          version: 1,
          type: "text",
          prompt: { text: "Hello world v1" },
          createdBy: "test-user",
        },
      });

      const prompt2 = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt-delete",
          version: 2,
          type: "text",
          prompt: { text: "Hello world v2" },
          createdBy: "test-user",
        },
      });

      // Delete all versions of the prompt
      await caller.prompts.delete({
        projectId: project.id,
        promptName: "test-prompt-delete",
      });

      // Verify prompts are deleted
      const remainingPrompts = await prisma.prompt.findMany({
        where: {
          projectId: project.id,
          name: "test-prompt-delete",
        },
      });
      expect(remainingPrompts).toHaveLength(0);
      await waitForExpect(async () => {
        // Verify automation executions were created for both deleted prompts
        const executions = await prisma.automationExecution.findMany({
          where: {
            projectId: project.id,
            triggerId: trigger.id,
            actionId: action.id,
          },
        });

        expect(executions).toHaveLength(2);
        expect(executions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sourceId: prompt1.id,
              status: "PENDING",
            }),
            expect.objectContaining({
              sourceId: prompt2.id,
              status: "PENDING",
            }),
          ]),
        );
      });
    });

    it("should delete prompts by pathPrefix (folder) including nested folders but preserving prompt with same name", async () => {
      const { project, caller } = await prepare();

      // Create test structure:
      // folder1/prompt-1 (Prompt)
      // folder1/folder2 (Prompt named folder1/folder2)
      // folder1/folder2/prompt-2 (Prompt inside folder1/folder2)
      // folder1/folder2/prompt-3 (Prompt inside folder1/folder2)

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "folder1/prompt-1",
          version: 1,
          type: "text",
          prompt: { text: "Hello world 1" },
          createdBy: "test-user",
        },
      });

      const promptNamedSameAsFolder = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "folder1/folder2",
          version: 1,
          type: "text",
          prompt: { text: "This is a prompt named folder1/folder2" },
          createdBy: "test-user",
        },
      });

      const prompt2 = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "folder1/folder2/prompt-2",
          version: 1,
          type: "text",
          prompt: { text: "Hello world 2" },
          createdBy: "test-user",
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "folder1/folder2/prompt-3",
          version: 1,
          type: "text",
          prompt: { text: "Hello world 3" },
          createdBy: "test-user",
        },
      });

      // Add intra-folder dependency: prompt-2 depends on prompt-3
      // This should NOT block folder deletion since both are inside the folder
      await prisma.promptDependency.create({
        data: {
          projectId: project.id,
          parentId: prompt2.id,
          childName: "folder1/folder2/prompt-3",
          childVersion: 1,
        },
      });

      // Delete the folder "folder1/folder2"
      await caller.prompts.delete({
        projectId: project.id,
        pathPrefix: "folder1/folder2",
      });

      // Verify nested items are deleted
      const nestedPrompts = await prisma.prompt.findMany({
        where: {
          projectId: project.id,
          name: { startsWith: "folder1/folder2/" },
        },
      });
      expect(nestedPrompts).toHaveLength(0);

      // Verify prompt named folder1/folder2 remains
      const sameNamePrompt = await prisma.prompt.findUnique({
        where: { id: promptNamedSameAsFolder.id },
      });
      expect(sameNamePrompt).not.toBeNull();
      expect(sameNamePrompt?.name).toBe("folder1/folder2");

      // Verify folder1/prompt-1 still exists
      const unrelatedPrompt = await prisma.prompt.findFirst({
        where: {
          projectId: project.id,
          name: "folder1/prompt-1",
        },
      });
      expect(unrelatedPrompt).not.toBeNull();
    });

    it("should treat wildcard characters in pathPrefix as literals for all/count/delete", async () => {
      const { project, caller } = await prepare();

      const literalPathPrefix = "folder%_x";
      const literalChildPromptName = `${literalPathPrefix}/inside`;
      const wildcardMatchPromptName = "folderABx/decoy";

      const promptNamedLikeFolder = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: literalPathPrefix,
          version: 1,
          type: "text",
          prompt: { text: "Prompt with wildcard chars in the name" },
          createdBy: "test-user",
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: literalChildPromptName,
          version: 1,
          type: "text",
          prompt: { text: "Prompt inside wildcard-like folder" },
          createdBy: "test-user",
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: wildcardMatchPromptName,
          version: 1,
          type: "text",
          prompt: { text: "Should not match literal wildcard folder prefix" },
          createdBy: "test-user",
        },
      });

      const listResult = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        pathPrefix: literalPathPrefix,
      });

      expect(listResult.prompts).toHaveLength(1);
      expect(listResult.prompts[0]?.name).toBe("inside");

      const countResult = await caller.prompts.count({
        projectId: project.id,
        pathPrefix: literalPathPrefix,
      });
      expect(countResult.totalCount).toBe(BigInt(1));

      await caller.prompts.delete({
        projectId: project.id,
        pathPrefix: literalPathPrefix,
      });

      const deletedChildPrompt = await prisma.prompt.findFirst({
        where: {
          projectId: project.id,
          name: literalChildPromptName,
        },
      });
      expect(deletedChildPrompt).toBeNull();

      const remainingPromptNamedLikeFolder = await prisma.prompt.findUnique({
        where: { id: promptNamedLikeFolder.id },
      });
      expect(remainingPromptNamedLikeFolder).not.toBeNull();

      const remainingWildcardMatchPrompt = await prisma.prompt.findFirst({
        where: {
          projectId: project.id,
          name: wildcardMatchPromptName,
        },
      });
      expect(remainingWildcardMatchPrompt).not.toBeNull();
    });
  });

  describe("prompts.deleteVersion", () => {
    it("should delete a specific version of a prompt", async () => {
      const { project, caller } = await prepare();

      // Create trigger for prompt deletions
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["deleted"],
          filter: [],
          status: "ACTIVE",
        },
      });

      // Create webhook action
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/prompt-delete-version-webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
          },
        },
      });

      // Link trigger to action
      await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Prompt Delete Version Automation",
        },
      });

      // Create test prompts with multiple versions
      const prompt1 = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt-delete-version",
          version: 1,
          type: "text",
          prompt: { text: "Hello world v1" },
          createdBy: "test-user",
        },
      });

      const prompt2 = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "test-prompt-delete-version",
          version: 2,
          type: "text",
          prompt: { text: "Hello world v2" },
          createdBy: "test-user",
        },
      });

      // Delete only version 1
      await caller.prompts.deleteVersion({
        projectId: project.id,
        promptVersionId: prompt1.id,
      });

      // Verify only version 1 is deleted
      const remainingPrompts = await prisma.prompt.findMany({
        where: {
          projectId: project.id,
          name: "test-prompt-delete-version",
        },
      });
      expect(remainingPrompts).toHaveLength(1);
      expect(remainingPrompts[0].id).toBe(prompt2.id);

      await waitForExpect(async () => {
        // Verify automation execution was created for the deleted prompt
        const executions = await prisma.automationExecution.findMany({
          where: {
            projectId: project.id,
            triggerId: trigger.id,
            actionId: action.id,
          },
        });

        expect(executions).toHaveLength(1);
        expect(executions[0]).toEqual(
          expect.objectContaining({
            sourceId: prompt1.id,
            status: "PENDING",
          }),
        );
      });
    });
  });

  describe("prompts.duplicatePrompt", () => {
    it("should duplicate a prompt and trigger webhook automation", async () => {
      const { project, caller } = await prepare();

      // Create trigger for prompt creation
      const trigger = await prisma.trigger.create({
        data: {
          id: v4(),
          projectId: project.id,
          eventSource: "prompt",
          eventActions: ["created"],
          filter: [],
          status: "ACTIVE",
        },
      });

      // Create webhook action
      const action = await prisma.action.create({
        data: {
          id: v4(),
          projectId: project.id,
          type: "WEBHOOK",
          config: {
            type: "WEBHOOK",
            url: "https://example.com/prompt-duplicate-webhook",
            headers: { "Content-Type": "application/json" },
            apiVersion: { prompt: "v1" },
          },
        },
      });

      // Link trigger to action
      await prisma.automation.create({
        data: {
          projectId: project.id,
          triggerId: trigger.id,
          actionId: action.id,
          name: "Prompt Duplicate Automation",
        },
      });

      // Create original prompt to duplicate
      const originalPrompt = await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "original-prompt",
          version: 1,
          type: "text",
          prompt: "Hello world original",
          createdBy: "test-user",
          labels: ["production"],
          tags: ["original"],
        },
      });

      // Duplicate the prompt
      const duplicatedPrompt = await caller.prompts.duplicatePrompt({
        projectId: project.id,
        promptId: originalPrompt.id,
        name: "duplicated-prompt",
        isSingleVersion: true,
      });

      expect(duplicatedPrompt).toMatchObject({
        name: "duplicated-prompt",
        version: 1,
        type: "text",
        prompt: "Hello world original",
        labels: expect.arrayContaining(["production", "latest"]),
        tags: ["original"],
      });

      // Verify the duplicated prompt exists in database
      const dbPrompt = await prisma.prompt.findUnique({
        where: { id: duplicatedPrompt.id },
      });
      expect(dbPrompt).not.toBeNull();
      expect(dbPrompt?.name).toBe("duplicated-prompt");

      await waitForExpect(async () => {
        // Verify automation execution was created for the duplicated prompt
        const executions = await prisma.automationExecution.findMany({
          where: {
            projectId: project.id,
            triggerId: trigger.id,
            actionId: action.id,
          },
        });

        expect(executions).toHaveLength(1);
        expect(executions[0]).toEqual(
          expect.objectContaining({
            sourceId: duplicatedPrompt.id,
            status: "PENDING",
          }),
        );
      });
    });
  });

  describe("prompts.all with search", () => {
    it("should find prompts by searching in content, name, tags, and labels", async () => {
      const { project, caller } = await prepare();

      // Create test prompts with different searchable content
      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "customer-service-prompt",
          version: 1,
          type: "text",
          prompt: {
            text: "You are a helpful customer support agent. Answer questions about billing and account issues.",
          },
          createdBy: "test-user",
          tags: ["support", "customer"],
          labels: ["production"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "marketing-prompt",
          version: 1,
          type: "text",
          prompt: {
            text: "Create engaging marketing content that drives sales and conversions.",
          },
          createdBy: "test-user",
          tags: ["marketing", "content"],
          labels: ["staging"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "technical-docs",
          version: 1,
          type: "text",
          prompt: {
            text: "Generate comprehensive technical documentation for APIs and software systems.",
          },
          createdBy: "test-user",
          tags: ["technical", "documentation"],
          labels: ["latest"],
        },
      });

      // Test 1: Search by prompt content
      const contentSearchResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        searchQuery: "customer support agent",
        searchType: ["content"],
      });

      expect(contentSearchResults.prompts).toHaveLength(1);
      expect(contentSearchResults.prompts[0].name).toBe(
        "customer-service-prompt",
      );

      // Test 2: Search by prompt name
      const nameSearchResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        searchQuery: "marketing",
        searchType: ["id"],
      });

      expect(nameSearchResults.prompts).toHaveLength(1);
      expect(nameSearchResults.prompts[0].name).toBe("marketing-prompt");

      // Test 3: Search by tags
      const tagSearchResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        searchQuery: "documentation",
        searchType: ["id"],
      });

      expect(tagSearchResults.prompts).toHaveLength(1);
      expect(tagSearchResults.prompts[0].name).toBe("technical-docs");

      // Test 4: Search with no matches
      const noMatchResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        searchQuery: "nonexistent content",
        searchType: ["id", "content"],
      });

      expect(noMatchResults.prompts).toHaveLength(0);

      // Test 5: Case insensitive search
      const caseInsensitiveResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        searchQuery: "TECHNICAL",
        searchType: ["id"],
      });

      expect(caseInsensitiveResults.prompts).toHaveLength(1);
      expect(caseInsensitiveResults.prompts[0].name).toBe("technical-docs");
    });

    it("should find prompts with multiple versions when searching content", async () => {
      const { project, caller } = await prepare();

      // Create multiple versions of the same prompt with different content
      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "evolving-prompt",
          version: 1,
          type: "text",
          prompt: { text: "You are a basic chatbot. Answer simple questions." },
          createdBy: "test-user",
          tags: ["basic"],
          labels: [],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "evolving-prompt",
          version: 2,
          type: "text",
          prompt: {
            text: "You are an advanced AI assistant with expertise in machine learning.",
          },
          createdBy: "test-user",
          tags: ["advanced"],
          labels: ["latest"],
        },
      });

      // Search for content that exists in version 2 but not version 1
      const searchResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        searchQuery: "machine learning",
        searchType: ["content"],
      });

      // Should find the prompt because one of its versions contains the search term
      expect(searchResults.prompts).toHaveLength(1);
      expect(searchResults.prompts[0].name).toBe("evolving-prompt");
      // The returned prompt should be the latest version
      expect(searchResults.prompts[0].version).toBe(2);
    });
  });

  describe("prompts.count with search and searchType", () => {
    it("should count prompts correctly with different search types", async () => {
      const { project, caller } = await prepare();

      // Create test prompts with different searchable content
      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "customer-service-prompt",
          version: 1,
          type: "text",
          prompt: {
            text: "You are a helpful customer support agent. Answer questions about billing and account issues.",
          },
          createdBy: "test-user",
          tags: ["support", "customer"],
          labels: ["production"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "marketing-prompt",
          version: 1,
          type: "text",
          prompt: {
            text: "Create engaging marketing content that drives sales and conversions.",
          },
          createdBy: "test-user",
          tags: ["marketing", "content"],
          labels: ["staging"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "technical-docs",
          version: 1,
          type: "text",
          prompt: {
            text: "Generate comprehensive technical documentation for APIs and software systems.",
          },
          createdBy: "test-user",
          tags: ["technical", "documentation"],
          labels: ["latest"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "sales-support-prompt",
          version: 1,
          type: "text",
          prompt: {
            text: "Assist sales teams with lead qualification and customer outreach.",
          },
          createdBy: "test-user",
          tags: ["sales", "support"],
          labels: ["production"],
        },
      });

      // Test 1: Count all prompts (no search)
      const totalCountResult = await caller.prompts.count({
        projectId: project.id,
      });
      expect(totalCountResult.totalCount).toBe(BigInt(4));

      // Test 2: Count with ID search type (default) - search in names and tags
      const idSearchCountResult = await caller.prompts.count({
        projectId: project.id,
        searchQuery: "support",
        searchType: ["id"],
      });
      // Should find "customer-service-prompt" and "sales-support-prompt" (by name and tags)
      expect(idSearchCountResult.totalCount).toBe(BigInt(2));

      // Test 3: Count with content search type - search in prompt content
      const contentSearchCountResult = await caller.prompts.count({
        projectId: project.id,
        searchQuery: "customer",
        searchType: ["content"],
      });
      // Should find "customer-service-prompt" and "sales-support-prompt" (by content: "customer" appears in both)
      expect(contentSearchCountResult.totalCount).toBe(BigInt(2));

      // Test 4: Count with both ID and content search types
      const combinedSearchCountResult = await caller.prompts.count({
        projectId: project.id,
        searchQuery: "marketing",
        searchType: ["id", "content"],
      });
      // Should find "marketing-prompt" (by both name and content)
      expect(combinedSearchCountResult.totalCount).toBe(BigInt(1));

      // Test 5: Count with tag-specific search (ID search type)
      const tagSearchCountResult = await caller.prompts.count({
        projectId: project.id,
        searchQuery: "documentation",
        searchType: ["id"],
      });
      // Should find "technical-docs" (by tag)
      expect(tagSearchCountResult.totalCount).toBe(BigInt(1));

      // Test 6: Count with content that doesn't exist in names/tags but exists in prompt text
      const contentOnlySearchResult = await caller.prompts.count({
        projectId: project.id,
        searchQuery: "billing",
        searchType: ["content"],
      });
      // Should find "customer-service-prompt" (by content only)
      expect(contentOnlySearchResult.totalCount).toBe(BigInt(1));

      // Test 7: Count with no matches
      const noMatchCountResult = await caller.prompts.count({
        projectId: project.id,
        searchQuery: "nonexistent",
        searchType: ["id", "content"],
      });
      expect(noMatchCountResult.totalCount).toBe(BigInt(0));

      // Test 8: Count with case insensitive search
      const caseInsensitiveCountResult = await caller.prompts.count({
        projectId: project.id,
        searchQuery: "TECHNICAL",
        searchType: ["id"],
      });
      // Should find "technical-docs" (case insensitive)
      expect(caseInsensitiveCountResult.totalCount).toBe(BigInt(1));

      // Test 9: Count with filters and search combined
      const filteredSearchCountResult = await caller.prompts.count({
        projectId: project.id,
        searchQuery: "support",
        searchType: ["id"],
        filter: [
          {
            column: "labels",
            type: "arrayOptions",
            operator: "any of",
            value: ["production"],
          },
        ],
      });
      // Should find prompts with "support" AND "production" label
      expect(filteredSearchCountResult.totalCount).toBe(BigInt(2));
    });

    it("should count prompts with folder path prefix and search", async () => {
      const { project, caller } = await prepare();

      // Create prompts in different folder structures
      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "folder1/customer-prompt",
          version: 1,
          type: "text",
          prompt: { text: "Customer service prompt" },
          createdBy: "test-user",
          tags: ["customer"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "folder1/support-prompt",
          version: 1,
          type: "text",
          prompt: { text: "Technical support prompt" },
          createdBy: "test-user",
          tags: ["support"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "folder2/customer-prompt",
          version: 1,
          type: "text",
          prompt: { text: "Another customer prompt" },
          createdBy: "test-user",
          tags: ["customer"],
        },
      });

      // Test: Count with path prefix and search
      const folderSearchCountResult = await caller.prompts.count({
        projectId: project.id,
        pathPrefix: "folder1",
        searchQuery: "customer",
        searchType: ["id"],
      });
      // Should only find prompts in folder1 that match "customer"
      expect(folderSearchCountResult.totalCount).toBe(BigInt(1));

      // Test: Count with path prefix but no search
      const folderCountResult = await caller.prompts.count({
        projectId: project.id,
        pathPrefix: "folder1",
      });
      // Should find all prompts in folder1
      expect(folderCountResult.totalCount).toBe(BigInt(2));
    });
  });

  describe("folder navigation with conflicting names", () => {
    it("should handle prompts where individual prompt name conflicts with folder prefix - BUG REPRODUCTION", async () => {
      const { project, caller } = await prepare();

      // Create the exact bug scenario:
      // - a/prompt (individual prompt)
      // - a/prompt/v1 (prompt in subfolder)
      // - a/prompt/v2 (prompt in subfolder)
      // Bug: LFE-6515
      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "a/prompt",
          version: 1,
          type: "text",
          prompt: { text: "This is the individual a/prompt" },
          createdBy: "test-user",
          tags: ["individual"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "a/prompt/v1",
          version: 1,
          type: "text",
          prompt: { text: "This is a/prompt/v1" },
          createdBy: "test-user",
          tags: ["subfolder"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "a/prompt/v2",
          version: 1,
          type: "text",
          prompt: { text: "This is a/prompt/v2" },
          createdBy: "test-user",
          tags: ["subfolder"],
        },
      });

      // Test 1: Root level should show folder "a"
      const rootResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
      });

      // Should show exactly one item: the "a" folder
      expect(rootResults.prompts).toHaveLength(1);
      expect(rootResults.prompts[0].name).toBe("a");

      // Test 2: Folder "a" level should show BOTH individual "prompt" AND folder entry for "prompt/*"
      const folderAResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        pathPrefix: "a",
      });

      // We expect 2 items: individual "prompt" and folder "prompt" (for v1, v2)
      expect(folderAResults.prompts).toHaveLength(2);

      // Should have both an individual prompt and a folder entry
      const promptNames = folderAResults.prompts.map((p) => p.name);
      expect(promptNames).toContain("prompt");

      // Test 3: Folder "a/prompt" level should show v1 and v2
      const subfolderResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        pathPrefix: "a/prompt",
      });

      // Should show exactly 2 items: v1 and v2
      expect(subfolderResults.prompts).toHaveLength(2);
      const subfolderNames = subfolderResults.prompts.map((p) => p.name);
      expect(subfolderNames).toContain("v1");
      expect(subfolderNames).toContain("v2");

      // Test 4: Count verification
      const rootCount = await caller.prompts.count({
        projectId: project.id,
      });
      expect(rootCount.totalCount).toBe(BigInt(1)); // Should show 1 folder

      const folderACount = await caller.prompts.count({
        projectId: project.id,
        pathPrefix: "a",
      });
      expect(folderACount.totalCount).toBe(BigInt(2)); // Should show individual + folder entry

      const subfolderCount = await caller.prompts.count({
        projectId: project.id,
        pathPrefix: "a/prompt",
      });
      expect(subfolderCount.totalCount).toBe(BigInt(2)); // Should show v1 and v2
    });

    it("should maintain search functionality across conflicting folder/prompt names", async () => {
      const { project, caller } = await prepare();

      // Create searchable content in conflicting structure
      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "search/test",
          version: 1,
          type: "text",
          prompt: { text: "Individual search test with unique keyword" },
          createdBy: "test-user",
          tags: ["searchable"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "search/test/nested1",
          version: 1,
          type: "text",
          prompt: { text: "Nested prompt with unique keyword" },
          createdBy: "test-user",
          tags: ["nested"],
        },
      });

      await prisma.prompt.create({
        data: {
          id: v4(),
          projectId: project.id,
          name: "search/test/nested2",
          version: 1,
          type: "text",
          prompt: { text: "Another nested prompt" },
          createdBy: "test-user",
          tags: ["nested"],
        },
      });

      // Test search at different folder levels
      const searchResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        searchQuery: "unique",
        searchType: ["content"],
      });

      // Should find prompts containing "unique" keyword
      expect(searchResults.prompts.length).toBeGreaterThan(0);

      // Test search within specific folder
      const folderSearchResults = await caller.prompts.all({
        projectId: project.id,
        page: 0,
        limit: 10,
        filter: [],
        orderBy: { column: "createdAt", order: "DESC" },
        pathPrefix: "search/test",
        searchQuery: "nested",
        searchType: ["content"],
      });
      // Should find nested prompts within the folder
      expect(folderSearchResults.prompts.length).toBeGreaterThan(0);
    });
  });
});
