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
import {
  createMcpTestSetup,
  createPromptInDb,
  verifyToolAnnotations,
} from "./mcp-helpers";

import {
  listPromptVersionsTool,
  handleListPromptVersions,
} from "@/src/features/mcp/features/prompts/tools/listPromptVersions";

describe("MCP Version Tools", () => {
  describe("listPromptVersions tool", () => {
    it("should have readOnlyHint annotation", () => {
      verifyToolAnnotations(listPromptVersionsTool, { readOnlyHint: true });
    });

    it("should list versions for a single prompt (sorted desc) with pagination", async () => {
      const { context, projectId } = await createMcpTestSetup();
      const promptName = `versions-test-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "v1",
        projectId,
        version: 1,
        labels: ["staging"],
        tags: ["t1"],
      });

      await createPromptInDb({
        name: promptName,
        prompt: "v2",
        projectId,
        version: 2,
        labels: ["production"],
        tags: ["t2"],
      });

      await createPromptInDb({
        name: promptName,
        prompt: "v3",
        projectId,
        version: 3,
        labels: ["latest"],
        tags: ["t3"],
      });

      const page1 = (await handleListPromptVersions(
        { name: promptName, page: 1, limit: 2 },
        context,
      )) as {
        data: Array<{ version: number }>;
        pagination: { totalItems: number; totalPages: number; page: number };
      };

      expect(page1.data.map((v) => v.version)).toEqual([3, 2]);
      expect(page1.pagination.totalItems).toBe(3);
      expect(page1.pagination.totalPages).toBe(2);
      expect(page1.pagination.page).toBe(1);

      const page2 = (await handleListPromptVersions(
        { name: promptName, page: 2, limit: 2 },
        context,
      )) as {
        data: Array<{ version: number }>;
        pagination: { totalItems: number; totalPages: number; page: number };
      };

      expect(page2.data.map((v) => v.version)).toEqual([1]);
      expect(page2.pagination.totalItems).toBe(3);
      expect(page2.pagination.totalPages).toBe(2);
      expect(page2.pagination.page).toBe(2);
    });

    it("should return empty results when prompt name does not exist", async () => {
      const { context } = await createMcpTestSetup();
      const promptName = `does-not-exist-${nanoid()}`;

      const result = (await handleListPromptVersions(
        { name: promptName, page: 1, limit: 100 },
        context,
      )) as {
        data: Array<unknown>;
        pagination: { totalItems: number; totalPages: number };
      };

      expect(result.data).toEqual([]);
      expect(result.pagination.totalItems).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it("should use context.projectId for tenant isolation", async () => {
      const { context: context1, projectId: projectId1 } =
        await createMcpTestSetup();
      const { context: context2, projectId: projectId2 } =
        await createMcpTestSetup();

      const promptName = `isolation-versions-${nanoid()}`;

      await createPromptInDb({
        name: promptName,
        prompt: "p1-v1",
        projectId: projectId1,
        version: 1,
      });
      await createPromptInDb({
        name: promptName,
        prompt: "p1-v2",
        projectId: projectId1,
        version: 2,
      });

      await createPromptInDb({
        name: promptName,
        prompt: "p2-v1",
        projectId: projectId2,
        version: 1,
      });

      const result1 = (await handleListPromptVersions(
        { name: promptName, page: 1, limit: 100 },
        context1,
      )) as { data: Array<{ version: number }> };
      expect(result1.data.map((v) => v.version)).toEqual([2, 1]);

      const result2 = (await handleListPromptVersions(
        { name: promptName, page: 1, limit: 100 },
        context2,
      )) as { data: Array<{ version: number }> };
      expect(result2.data.map((v) => v.version)).toEqual([1]);
    });
  });
});
