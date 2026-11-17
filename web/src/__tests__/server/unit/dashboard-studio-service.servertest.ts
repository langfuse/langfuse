import { describe, expect, it, vi } from "vitest";
import {
  StudioWidgetConfigSchema,
  InvalidRequestError,
} from "@langfuse/shared";
import { queryClickhouseWithProgress } from "@langfuse/shared/src/server";
import { executeStudioWidget } from "@/src/features/dashboard/server/dashboard-studio-service";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  queryClickhouseWithProgress: vi.fn(),
}));

describe("dashboard studio execution errors", () => {
  it("scrubs unexpected failures, preserves successful sources, and rejects invalid queries before execution", async () => {
    const internalMessage =
      "Database host internal.example:8123 rejected secret-credential";
    const transport = vi.mocked(queryClickhouseWithProgress);
    transport.mockImplementationOnce(async function* () {
      throw new Error(internalMessage);
    });
    transport.mockImplementationOnce(async function* () {
      yield { row: { count_count: 7 } };
    });
    const config = StudioWidgetConfigSchema.parse({
      version: 1,
      title: "Failure isolation",
      description: "",
      queries: ["a", "b"].map((id) => ({
        id,
        label: id,
        view: "observations",
        metrics: [{ id: "count", measure: "count", aggregation: "count" }],
        dimensions: [],
        filters: [],
      })),
      expressions: [],
      display: { chartType: "NUMBER" },
    });
    const input = {
      projectId: "studio-error-test",
      config,
      fromTimestamp: "2026-10-01T00:00:00Z",
      toTimestamp: "2026-10-02T00:00:00Z",
      version: "v2" as const,
      granularity: "auto" as const,
      filters: [],
    };
    const result = await executeStudioWidget(input);
    expect(result.status).toBe("partial");
    expect(result.rows.map((row) => row.value)).toEqual([7]);
    expect(result.diagnostics[0].error).toBe("Query failed. Please try again.");
    expect(JSON.stringify(result)).not.toContain(internalMessage);

    transport.mockClear();
    const invalid = executeStudioWidget({
      ...input,
      config: {
        ...config,
        queries: [
          config.queries[0],
          {
            ...config.queries[1],
            view: "scores-boolean",
            filters: [
              { column: "value", type: "number", operator: "=", value: 1 },
            ],
          },
        ],
      },
    });
    await expect(invalid).rejects.toBeInstanceOf(InvalidRequestError);
    await expect(invalid).rejects.toMatchObject({ httpCode: 400 });
    expect(transport).not.toHaveBeenCalled();
  });
});
