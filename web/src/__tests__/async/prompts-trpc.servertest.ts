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
      });

      // Should find the prompt because one of its versions contains the search term
      expect(searchResults.prompts).toHaveLength(1);
      expect(searchResults.prompts[0].name).toBe("evolving-prompt");
      // The returned prompt should be the latest version
      expect(searchResults.prompts[0].version).toBe(2);
    });
  });
});
