import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@langfuse/shared/src/env";
import { executeQuery, QueryBuilder } from "@langfuse/shared/query/server";
import {
  listScoresV3ForPublicApi,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import {
  getEventFilterNumericRange,
  getEventFilterValuePage,
} from "@/src/features/events/server/eventsService";
import { MCP_CLICKHOUSE_SETTINGS } from "@/src/features/mcp/core/clickhouse-settings";

vi.mock(
  "../../../../../packages/shared/src/server/repositories/clickhouse",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    queryClickhouse: vi.fn(),
  }),
);

describe("MCP ClickHouse execution limits", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(queryClickhouse).mockReset().mockResolvedValue([]);
  });

  it.each(["events_core", "traces"])(
    "preserves metrics settings and applies the timeout for %s queries",
    async (table) => {
      vi.spyOn(QueryBuilder.prototype, "build").mockResolvedValue({
        query: `SELECT count() FROM ${table}`,
        parameters: {},
      });

      await executeQuery(
        "project-id",
        {
          view: "observations",
          dimensions: [],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: "2026-10-01T00:00:00Z",
          toTimestamp: "2026-10-02T00:00:00Z",
          orderBy: null,
        },
        "v2",
        true,
        { clickhouseSettings: MCP_CLICKHOUSE_SETTINGS },
      );

      expect(queryClickhouse).toHaveBeenCalledOnce();
      expect(queryClickhouse).toHaveBeenCalledWith(
        expect.objectContaining({
          clickhouseSettings: expect.objectContaining({
            max_execution_time: 25,
            date_time_output_format: "iso",
            max_bytes_before_external_group_by: String(
              env.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY,
            ),
          }),
        }),
      );
    },
  );

  it.each([true, false])(
    "keeps score query limits opt-in: %s",
    async (applyLimit) => {
      await listScoresV3ForPublicApi(
        {
          projectId: "project-id",
          limit: 1,
          fields: ["core"],
        },
        applyLimit
          ? { clickhouseSettings: MCP_CLICKHOUSE_SETTINGS }
          : undefined,
      );

      expect(queryClickhouse).toHaveBeenCalledOnce();
      expect(queryClickhouse).toHaveBeenCalledWith(
        expect.objectContaining({
          clickhouseSettings: applyLimit
            ? { max_execution_time: 25 }
            : undefined,
        }),
      );
    },
  );

  it("passes the limit through categorical filter-value queries", async () => {
    await getEventFilterValuePage({
      projectId: "project-id",
      column: "name",
      limit: 20,
      offset: 0,
      clickhouseSettings: MCP_CLICKHOUSE_SETTINGS,
    });

    expect(queryClickhouse).toHaveBeenCalledOnce();
    expect(queryClickhouse).toHaveBeenCalledWith(
      expect.objectContaining({
        clickhouseSettings: { max_execution_time: 25 },
      }),
    );
  });

  it("passes the limit through numeric filter-value queries", async () => {
    await getEventFilterNumericRange({
      projectId: "project-id",
      column: "latency",
      clickhouseSettings: MCP_CLICKHOUSE_SETTINGS,
    });

    expect(queryClickhouse).toHaveBeenCalledOnce();
    expect(queryClickhouse).toHaveBeenCalledWith(
      expect.objectContaining({
        clickhouseSettings: { max_execution_time: 25 },
      }),
    );
  });
});
