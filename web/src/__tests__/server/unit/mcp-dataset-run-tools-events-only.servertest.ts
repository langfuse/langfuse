const mockEnv = vi.hoisted(() => ({
  env: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "events_only" as string,
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { rejectDatasetRunToolsInEventsOnlyMode } from "@/src/features/mcp/features/datasets/events-only-guard";
import { handleCreateDatasetRunItem } from "@/src/features/mcp/features/datasets/tools/createDatasetRunItem";
import { handleDeleteDatasetRun } from "@/src/features/mcp/features/datasets/tools/deleteDatasetRun";
import { handleGetDatasetRun } from "@/src/features/mcp/features/datasets/tools/getDatasetRun";
import { handleListDatasetRunItems } from "@/src/features/mcp/features/datasets/tools/listDatasetRunItems";
import { handleListDatasetRuns } from "@/src/features/mcp/features/datasets/tools/listDatasetRuns";
import type { ServerContext } from "@/src/features/mcp/types";

const context = {
  projectId: "test-project",
  orgId: "test-org",
  apiKeyId: "test-api-key",
} as ServerContext;

// The guard must throw before any auth, Postgres, or ClickHouse access, so
// these handler calls are expected to fail fast without any infrastructure.
const toolCalls: Array<[string, () => Promise<unknown>]> = [
  [
    "listDatasetRuns",
    () =>
      handleListDatasetRuns(
        { datasetId: "dataset-id", page: 1, limit: 50 },
        context,
      ),
  ],
  [
    "getDatasetRun",
    () =>
      handleGetDatasetRun(
        { datasetId: "dataset-id", datasetRunId: "run-id" },
        context,
      ),
  ],
  [
    "listDatasetRunItems",
    () =>
      handleListDatasetRunItems(
        { datasetId: "dataset-id", datasetRunId: "run-id", page: 1, limit: 50 },
        context,
      ),
  ],
  [
    "deleteDatasetRun",
    () =>
      handleDeleteDatasetRun(
        { datasetId: "dataset-id", datasetRunId: "run-id" },
        context,
      ),
  ],
  [
    "createDatasetRunItem",
    () =>
      handleCreateDatasetRunItem(
        {
          runName: "run-name",
          datasetItemId: "dataset-item-id",
          traceId: "trace-id",
        },
        context,
      ),
  ],
];

describe("MCP dataset run tools in events_only mode", () => {
  beforeEach(() => {
    mockEnv.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
  });

  it.each(toolCalls)(
    "%s rejects with the events_only error",
    async (_name, call) => {
      await expect(call()).rejects.toBeInstanceOf(McpError);
      await expect(call()).rejects.toThrowError(
        /events_only mode.*experiments tools/,
      );
    },
  );

  it("does not throw outside of events_only mode", () => {
    mockEnv.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
    expect(() => rejectDatasetRunToolsInEventsOnlyMode()).not.toThrow();

    mockEnv.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
    expect(() => rejectDatasetRunToolsInEventsOnlyMode()).not.toThrow();
  });
});
