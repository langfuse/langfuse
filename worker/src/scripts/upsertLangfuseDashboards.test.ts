import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dashboardWidgetFindMany = vi.hoisted(() => vi.fn());
const dashboardWidgetUpsert = vi.hoisted(() => vi.fn());
const dashboardFindMany = vi.hoisted(() => vi.fn());
const dashboardUpsert = vi.hoisted(() => vi.fn());

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    dashboardWidget: {
      findMany: dashboardWidgetFindMany,
      upsert: dashboardWidgetUpsert,
    },
    dashboard: {
      findMany: dashboardFindMany,
      upsert: dashboardUpsert,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  };
});

import langfuseDashboards from "../constants/langfuse-dashboards.json";
import { env } from "../env";
import { upsertLangfuseDashboards } from "./upsertLangfuseDashboards";

const PROMPT_CACHE_UTILIZATION_WIDGET_ID = "l0liih2p6mb79934helasxiy";
const INPUT_SPEND_WITHOUT_CACHE_WIDGET_ID = "oqhqp4ikycjg5b69lwslv7hg";

describe("managed cache widgets", () => {
  const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
    dashboardWidgetFindMany.mockResolvedValue([]);
    dashboardWidgetUpsert.mockResolvedValue(undefined);
    dashboardFindMany.mockResolvedValue([]);
    dashboardUpsert.mockResolvedValue(undefined);
  });

  afterEach(() => {
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
  });

  it("places cache utilization in Usage Management and no-cache spend in Cost", () => {
    const promptCacheWidget = langfuseDashboards.widgets.find(
      (widget) => widget.id === PROMPT_CACHE_UTILIZATION_WIDGET_ID,
    );
    const inputSpendWidget = langfuseDashboards.widgets.find(
      (widget) => widget.id === INPUT_SPEND_WITHOUT_CACHE_WIDGET_ID,
    );
    const usageDashboard = langfuseDashboards.dashboards.find(
      (dashboard) => dashboard.name === "Langfuse Usage Management",
    );
    const costDashboard = langfuseDashboards.dashboards.find(
      (dashboard) => dashboard.name === "Langfuse Cost Dashboard",
    );

    expect(promptCacheWidget).toMatchObject({
      dimensions: [{ field: "inputCacheStatus" }],
      metrics: [{ agg: "sum", measure: "inputTokensByCacheStatus" }],
      minVersion: 2,
    });
    expect(inputSpendWidget).toMatchObject({
      dimensions: [{ field: "name" }],
      metrics: [{ agg: "sum", measure: "inputCost" }],
      filters: expect.arrayContaining([
        expect.objectContaining({
          column: "cachedInputTokens",
          operator: "<=",
          value: 0,
        }),
      ]),
      minVersion: 2,
    });
    expect(usageDashboard?.definition.widgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          widgetId: PROMPT_CACHE_UTILIZATION_WIDGET_ID,
        }),
      ]),
    );
    expect(costDashboard?.definition.widgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          widgetId: INPUT_SPEND_WITHOUT_CACHE_WIDGET_ID,
        }),
      ]),
    );
  });

  it("persists both widgets as events-backed definitions", async () => {
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    await upsertLangfuseDashboards(true);

    for (const id of [
      PROMPT_CACHE_UTILIZATION_WIDGET_ID,
      INPUT_SPEND_WITHOUT_CACHE_WIDGET_ID,
    ]) {
      expect(dashboardWidgetUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id },
          create: expect.objectContaining({ minVersion: 2 }),
          update: expect.objectContaining({ minVersion: 2 }),
        }),
      );
    }
  });

  it("removes events-backed placements from managed dashboards in legacy mode", async () => {
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
    const cacheDashboards = langfuseDashboards.dashboards.filter((dashboard) =>
      dashboard.definition.widgets.some((placement) =>
        [
          PROMPT_CACHE_UTILIZATION_WIDGET_ID,
          INPUT_SPEND_WITHOUT_CACHE_WIDGET_ID,
        ].includes("widgetId" in placement ? placement.widgetId : ""),
      ),
    );
    dashboardFindMany.mockResolvedValue(
      cacheDashboards.map((dashboard) => ({
        id: dashboard.id,
        updatedAt: new Date(dashboard.updatedAt),
        definition: dashboard.definition,
      })),
    );

    await upsertLangfuseDashboards();

    for (const dashboard of cacheDashboards) {
      expect(dashboardUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: dashboard.id },
          update: expect.objectContaining({
            definition: expect.objectContaining({
              widgets: expect.not.arrayContaining([
                expect.objectContaining({
                  widgetId: PROMPT_CACHE_UTILIZATION_WIDGET_ID,
                }),
                expect.objectContaining({
                  widgetId: INPUT_SPEND_WITHOUT_CACHE_WIDGET_ID,
                }),
              ]),
            }),
          }),
        }),
      );
    }
  });
});
