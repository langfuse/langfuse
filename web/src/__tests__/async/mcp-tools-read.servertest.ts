/** @jest-environment node */

// Mock queue operations to avoid Redis dependency in tests
jest.mock("@langfuse/shared/src/server", () => {
  const actual = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...actual,
    // Mock queue getInstance to return a no-op queue
    EventPropagationQueue: {
      getInstance: () => ({
        add: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      }),
    },
  };
});

import { nanoid } from "nanoid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createMcpTestSetup,
  createPromptInDb,
  verifyToolAnnotations,
} from "./mcp-helpers";

// Import MCP tool handlers directly
import {
  getPromptTool,
  handleGetPrompt,
} from "@/src/features/mcp/features/prompts/tools/getPrompt";
import {
  getPromptUnresolvedTool,
  handleGetPromptUnresolved,
} from "@/src/features/mcp/features/prompts/tools/getPromptUnresolved";
import {
  listPromptsTool,
  handleListPrompts,
} from "@/src/features/mcp/features/prompts/tools/listPrompts";

describe("MCP Read Tools", () => {
  describe("getPrompt tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getPromptTool, { readOnlyHint: true });
    });

    it("should fetch prompt by name only (defaults to production label)", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      // Create a prompt with production label
      await createPromptInDb({
        name: promptName,
        prompt: "You are a helpful assistant.",
        projectId,
        labels: ["production"],
        version: 1,
      });

      const result = (await handleGetPrompt({ name: promptName }, context)) as {
        name: string;
        version: number;
        labels: string[];
      };

      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.labels).toContain("production");
    });

    it("should fetch prompt by name and specific label", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      // Create v1 with staging label
      await createPromptInDb({
        name: promptName,
        prompt: "Version 1",
        projectId,
        labels: ["staging"],
        version: 1,
      });

      // Create v2 with production label
      await createPromptInDb({
        name: promptName,
        prompt: "Version 2",
        projectId,
        labels: ["production"],
        version: 2,
      });

      const result = (await handleGetPrompt(
        { name: promptName, label: "staging" },
        context,
      )) as { version: number; prompt: string };

      expect(result.version).toBe(1);
      expect(result.prompt).toBe("Version 1");
    });

    it("should fetch prompt by name and specific version", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Version 1",
        projectId,
        version: 1,
      });

      await createPromptInDb({
        name: promptName,
        prompt: "Version 2",
        projectId,
        version: 2,
      });

      const result = (await handleGetPrompt(
        { name: promptName, version: 2 },
        context,
      )) as { version: number; prompt: string };

      expect(result.version).toBe(2);
      expect(result.prompt).toBe("Version 2");
    });

    it("should throw error when both label and version are specified", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
      });

      // The input schema refinement should reject this
      await expect(
        handleGetPrompt(
          { name: promptName, label: "production", version: 1 },
          context,
        ),
      ).rejects.toThrow();
    });

    it("should return error for non-existent prompt", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleGetPrompt({ name: "non-existent-prompt" }, context),
      ).rejects.toThrow(/not found/i);
    });

    it("should return error for non-existent label", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: ["staging"],
      });

      await expect(
        handleGetPrompt({ name: promptName, label: "production" }, context),
      ).rejects.toThrow(/not found/i);
    });

    it("should return error for non-existent version", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        version: 1,
      });

      await expect(
        handleGetPrompt({ name: promptName, version: 999 }, context),
      ).rejects.toThrow(/not found/i);
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();
      const { context: context2, projectId: projectId2 } =
        await createMcpTestSetup();

      const promptName = `shared-name-${nanoid()}`;

      // Create same-named prompt in both projects
      await createPromptInDb({
        name: promptName,
        prompt: "Project 1 content",
        projectId: projectId1,
        labels: ["production"],
      });

      await createPromptInDb({
        name: promptName,
        prompt: "Project 2 content",
        projectId: projectId2,
        labels: ["production"],
      });

      // Each context should only see its own project's prompt
      const result1 = (await handleGetPrompt(
        { name: promptName },
        context1,
      )) as { prompt: string };
      expect(result1.prompt).toBe("Project 1 content");

      const result2 = (await handleGetPrompt(
        { name: promptName },
        context2,
      )) as { prompt: string };
      expect(result2.prompt).toBe("Project 2 content");
    });

    it("should handle special characters in prompt name", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-special!@#$%${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Special chars test",
        projectId,
        labels: ["production"],
      });

      const result = (await handleGetPrompt({ name: promptName }, context)) as {
        name: string;
      };
      expect(result.name).toBe(promptName);
    });

    it("should include prompt config in response", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: ["production"],
        config: { model: "gpt-4", temperature: 0.7 },
      });

      const result = (await handleGetPrompt({ name: promptName }, context)) as {
        config: Record<string, unknown>;
      };

      expect(result.config).toEqual({ model: "gpt-4", temperature: 0.7 });
    });

    it("should include tags in response", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: ["production"],
        tags: ["experimental", "v2"],
      });

      const result = (await handleGetPrompt({ name: promptName }, context)) as {
        tags: string[];
      };

      expect(result.tags).toEqual(["experimental", "v2"]);
    });
  });

  describe("listPrompts tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(listPromptsTool, { readOnlyHint: true });
    });

    it("should list all prompts for project", async () => {
      const { context, projectId } = await createMcpTestSetup();

      // Create multiple prompts
      const prompt1Name = `list-test-1-${nanoid()}`;
      const prompt2Name = `list-test-2-${nanoid()}`;

      await createPromptInDb({
        name: prompt1Name,
        prompt: "First prompt",
        projectId,
      });

      await createPromptInDb({
        name: prompt2Name,
        prompt: "Second prompt",
        projectId,
      });

      const result = (await handleListPrompts(
        { page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{ name: string }>;
        pagination: { totalItems: number };
      };

      // Should include our prompts (may include others from setup)
      const names = result.data.map((p) => p.name);
      expect(names).toContain(prompt1Name);
      expect(names).toContain(prompt2Name);
      expect(result.pagination.totalItems).toBeGreaterThanOrEqual(2);
    });

    it("should filter by name", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const uniquePrefix = `filter-name-${nanoid()}`;

      await createPromptInDb({
        name: `${uniquePrefix}-match`,
        prompt: "Match",
        projectId,
      });

      await createPromptInDb({
        name: `other-${nanoid()}`,
        prompt: "No match",
        projectId,
      });

      const result = (await handleListPrompts(
        { name: `${uniquePrefix}-match`, page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{ name: string }>;
      };

      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe(`${uniquePrefix}-match`);
    });

    it("should filter by label", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `filter-label-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Production version",
        projectId,
        labels: ["production"],
        version: 1,
      });

      await createPromptInDb({
        name: `other-${nanoid()}`,
        prompt: "Staging version",
        projectId,
        labels: ["staging"],
        version: 1,
      });

      const result = (await handleListPrompts(
        { label: "production", page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{ name: string; labels: string[] }>;
      };

      // All returned prompts should have production label
      for (const prompt of result.data) {
        expect(prompt.labels).toContain("production");
      }
    });

    it("should filter by tag", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `filter-tag-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Tagged prompt",
        projectId,
        tags: ["experimental"],
      });

      await createPromptInDb({
        name: `untagged-${nanoid()}`,
        prompt: "Untagged prompt",
        projectId,
        tags: [],
      });

      const result = (await handleListPrompts(
        { tag: "experimental", page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{ name: string; tags: string[] }>;
      };

      // Should only return prompts with experimental tag
      expect(result.data.length).toBeGreaterThan(0);
      for (const prompt of result.data) {
        expect(prompt.tags).toContain("experimental");
      }
    });

    it("should filter by fromUpdatedAt", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const oldPrompt = `filter-from-updated-${nanoid()}`;
      const newPrompt = `filter-from-updated-${nanoid()}`;

      const oldDate = new Date("2026-01-01T00:00:00.000Z");
      const newDate = new Date("2026-02-01T00:00:00.000Z");

      await prisma.prompt.create({
        data: {
          name: oldPrompt,
          prompt: "old",
          labels: [],
          tags: [],
          type: "text",
          version: 1,
          config: {},
          createdBy: "test-user",
          createdAt: oldDate,
          updatedAt: oldDate,
          project: { connect: { id: projectId } },
        },
      });

      await prisma.prompt.create({
        data: {
          name: newPrompt,
          prompt: "new",
          labels: [],
          tags: [],
          type: "text",
          version: 1,
          config: {},
          createdBy: "test-user",
          createdAt: newDate,
          updatedAt: newDate,
          project: { connect: { id: projectId } },
        },
      });

      const result = (await handleListPrompts(
        {
          fromUpdatedAt: "2026-01-15T00:00:00.000Z",
          page: 1,
          limit: 100,
        },
        context,
      )) as { data: Array<{ name: string }> };

      const names = result.data.map((p) => p.name);
      expect(names).toContain(newPrompt);
      expect(names).not.toContain(oldPrompt);
    });

    it("should filter by toUpdatedAt", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const oldPrompt = `filter-to-updated-${nanoid()}`;
      const newPrompt = `filter-to-updated-${nanoid()}`;

      const oldDate = new Date("2026-01-01T00:00:00.000Z");
      const newDate = new Date("2026-02-01T00:00:00.000Z");

      await prisma.prompt.create({
        data: {
          name: oldPrompt,
          prompt: "old",
          labels: [],
          tags: [],
          type: "text",
          version: 1,
          config: {},
          createdBy: "test-user",
          createdAt: oldDate,
          updatedAt: oldDate,
          project: { connect: { id: projectId } },
        },
      });

      await prisma.prompt.create({
        data: {
          name: newPrompt,
          prompt: "new",
          labels: [],
          tags: [],
          type: "text",
          version: 1,
          config: {},
          createdBy: "test-user",
          createdAt: newDate,
          updatedAt: newDate,
          project: { connect: { id: projectId } },
        },
      });

      const result = (await handleListPrompts(
        {
          toUpdatedAt: "2026-01-15T00:00:00.000Z",
          page: 1,
          limit: 100,
        },
        context,
      )) as { data: Array<{ name: string }> };

      const names = result.data.map((p) => p.name);
      expect(names).toContain(oldPrompt);
      expect(names).not.toContain(newPrompt);
    });

    it("should return error when fromUpdatedAt is after toUpdatedAt", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleListPrompts(
          {
            fromUpdatedAt: "2026-02-02T00:00:00.000Z",
            toUpdatedAt: "2026-02-01T00:00:00.000Z",
            page: 1,
            limit: 50,
          },
          context,
        ),
      ).rejects.toThrow(/fromUpdatedAt.*<=.*toUpdatedAt/i);
    });

    it("should handle pagination with page and limit", async () => {
      const { context, projectId } = await createMcpTestSetup();

      // Create enough prompts to test pagination
      for (let i = 0; i < 5; i++) {
        await createPromptInDb({
          name: `pagination-test-${i}-${nanoid()}`,
          prompt: `Prompt ${i}`,
          projectId,
        });
      }

      const result = (await handleListPrompts(
        { page: 1, limit: 2 },
        context,
      )) as {
        data: Array<{ name: string }>;
        pagination: { page: number; limit: number; totalPages: number };
      };

      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });

    it("should return empty results for no matches", async () => {
      const { context } = await createMcpTestSetup();

      const result = (await handleListPrompts(
        { name: `non-existent-${nanoid()}`, page: 1, limit: 100 },
        context,
      )) as {
        data: Array<unknown>;
        pagination: { totalItems: number };
      };

      expect(result.data).toEqual([]);
      expect(result.pagination.totalItems).toBe(0);
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();
      const { context: context2 } = await createMcpTestSetup();

      const uniqueName = `isolation-test-${nanoid()}`;

      // Create prompt only in project 1
      await createPromptInDb({
        name: uniqueName,
        prompt: "Project 1 only",
        projectId: projectId1,
      });

      // Project 1 should see it
      const result1 = (await handleListPrompts(
        { name: uniqueName, page: 1, limit: 100 },
        context1,
      )) as { data: Array<unknown> };
      expect(result1.data.length).toBe(1);

      // Project 2 should not see it
      const result2 = (await handleListPrompts(
        { name: uniqueName, page: 1, limit: 100 },
        context2,
      )) as { data: Array<unknown> };
      expect(result2.data.length).toBe(0);
    });

    it("should respect default pagination values", async () => {
      const { context } = await createMcpTestSetup();

      const result = (await handleListPrompts(
        { page: 1, limit: 100 },
        context,
      )) as {
        pagination: { page: number; limit: number };
      };

      // Default values from validation schema
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBeLessThanOrEqual(100); // Max limit
    });

    it("should include prompt metadata in list results", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `metadata-test-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "Test",
        projectId,
        labels: ["production"],
        tags: ["important"],
        version: 1,
      });

      const result = (await handleListPrompts(
        { name: promptName, page: 1, limit: 100 },
        context,
      )) as {
        data: Array<{
          name: string;
          version: number;
          labels: string[];
          tags: string[];
        }>;
      };

      expect(result.data[0].name).toBe(promptName);
      expect(result.data[0].labels).toContain("production");
      expect(result.data[0].tags).toContain("important");
    });
  });

  describe("getPromptUnresolved tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(getPromptUnresolvedTool, { readOnlyHint: true });
    });

    it("should fetch prompt without resolving dependencies (by name only)", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-unresolved-${nanoid()}`;

      // Create a prompt with dependency tags (unresolved)
      const rawPromptContent =
        "You are a helpful assistant. @@@langfusePrompt:name=base-instructions|label=production@@@";

      await createPromptInDb({
        name: promptName,
        prompt: rawPromptContent,
        projectId,
        labels: ["production"],
        version: 1,
      });

      const result = (await handleGetPromptUnresolved(
        { name: promptName },
        context,
      )) as {
        name: string;
        version: number;
        prompt: string;
        labels: string[];
      };

      expect(result.name).toBe(promptName);
      expect(result.version).toBe(1);
      expect(result.labels).toContain("production");
      // Verify dependency tags are NOT resolved
      expect(result.prompt).toBe(rawPromptContent);
      expect(result.prompt).toContain(
        "@@@langfusePrompt:name=base-instructions|label=production@@@",
      );
    });

    it("should fetch prompt by name and specific label without resolution", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-unresolved-${nanoid()}`;

      // Create v1 with staging label
      await createPromptInDb({
        name: promptName,
        prompt: "Version 1 @@@langfusePrompt:name=helper|label=staging@@@",
        projectId,
        labels: ["staging"],
        version: 1,
      });

      // Create v2 with production label
      await createPromptInDb({
        name: promptName,
        prompt: "Version 2 @@@langfusePrompt:name=helper|label=production@@@",
        projectId,
        labels: ["production"],
        version: 2,
      });

      const result = (await handleGetPromptUnresolved(
        { name: promptName, label: "staging" },
        context,
      )) as { version: number; prompt: string };

      expect(result.version).toBe(1);
      expect(result.prompt).toBe(
        "Version 1 @@@langfusePrompt:name=helper|label=staging@@@",
      );
    });

    it("should fetch prompt by name and specific version without resolution", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-prompt-unresolved-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "V1 content @@@langfusePrompt:name=dep|label=v1@@@",
        projectId,
        labels: ["staging"],
        version: 1,
      });

      await createPromptInDb({
        name: promptName,
        prompt: "V2 content @@@langfusePrompt:name=dep|label=v2@@@",
        projectId,
        labels: ["production"],
        version: 2,
      });

      const result = (await handleGetPromptUnresolved(
        { name: promptName, version: 1 },
        context,
      )) as { version: number; prompt: string };

      expect(result.version).toBe(1);
      expect(result.prompt).toBe(
        "V1 content @@@langfusePrompt:name=dep|label=v1@@@",
      );
    });

    it("should throw error if prompt not found", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleGetPromptUnresolved(
          { name: "non-existent-prompt-12345" },
          context,
        ),
      ).rejects.toThrow("Prompt 'non-existent-prompt-12345' not found");
    });

    it("should throw error when both label and version are specified", async () => {
      const { context } = await createMcpTestSetup();

      await expect(
        handleGetPromptUnresolved(
          { name: "test", label: "production", version: 1 },
          context,
        ),
      ).rejects.toThrow(
        "Cannot specify both label and version - they are mutually exclusive",
      );
    });

    it("should return raw chat prompt without resolving dependencies", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `test-chat-unresolved-${nanoid()}`;

      const chatMessages = [
        {
          role: "system",
          content:
            "You are helpful @@@langfusePrompt:name=system-base|label=production@@@",
        },
        {
          role: "user",
          content: "@@@langfusePrompt:name=user-template|label=production@@@",
        },
      ];

      await createPromptInDb({
        name: promptName,
        prompt: chatMessages,
        projectId,
        labels: ["production"],
        version: 1,
        type: "chat",
      });

      const result = (await handleGetPromptUnresolved(
        { name: promptName },
        context,
      )) as {
        name: string;
        type: string;
        prompt: Array<{ role: string; content: string }>;
      };

      expect(result.type).toBe("chat");
      expect(result.prompt).toEqual(chatMessages);
      expect(result.prompt[0].content).toContain(
        "@@@langfusePrompt:name=system-base|label=production@@@",
      );
    });
  });
});
