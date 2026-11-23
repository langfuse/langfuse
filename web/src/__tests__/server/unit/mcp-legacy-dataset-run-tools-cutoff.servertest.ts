import { describe, expect, it, vi } from "vitest";

const { cutoff, listDatasetRunsByDatasetIdForApi } = vi.hoisted(() => ({
  cutoff: {
    cloudRegion: "EU" as string | undefined,
    publicApi: "true" as "true" | "false",
    exemptProjectIds: ["exempt-project"] as string[],
  },
  listDatasetRunsByDatasetIdForApi: vi.fn(),
}));

vi.mock(import("@/src/env.mjs"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    env: new Proxy(original.env, {
      get(target, property, receiver) {
        if (property === "LANGFUSE_MIGRATION_V4_WRITE_MODE") return "dual";
        if (property === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION") {
          return cutoff.cloudRegion;
        }
        if (property === "LANGFUSE_V4_CUTOFF_PUBLIC_API") {
          return cutoff.publicApi;
        }
        if (property === "LANGFUSE_V4_CUTOFF_EXEMPT_PROJECT_IDS") {
          return cutoff.exemptProjectIds;
        }
        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

vi.mock("@/src/features/datasets/server/publicDatasetService", () => ({
  listDatasetRunsByDatasetIdForApi,
}));

import { handleListDatasetRuns } from "@/src/features/mcp/server/datasets/tools/listDatasetRuns";
import { mockServerContext } from "@/src/__tests__/server/mcp-helpers";

describe("legacy dataset run MCP tools and the v3 cutoff", () => {
  it("rejects a project the cutoff applies to and serves an exempt project", async () => {
    listDatasetRunsByDatasetIdForApi.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, totalItems: 0, totalPages: 0 },
    });
    const input = { datasetId: "dataset-1", page: 1, limit: 50 };

    await expect(
      handleListDatasetRuns(
        input,
        mockServerContext({ projectId: "regular-project" }),
      ),
    ).rejects.toThrow(/removed from Langfuse Cloud.*experiments tools/s);
    expect(listDatasetRunsByDatasetIdForApi).not.toHaveBeenCalled();

    await handleListDatasetRuns(
      input,
      mockServerContext({ projectId: "exempt-project" }),
    );
    expect(listDatasetRunsByDatasetIdForApi).toHaveBeenCalledOnce();
  });
});
