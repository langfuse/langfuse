// The public widget API stamps the internal `minVersion` that decides whether a
// widget queries the v1 tables or the v2 events_* tables. Only the deployment
// knows which of the two it can serve, so these cases pin the behavior on a
// deployment without a v4 write mode — the v3 default (LFE-14581).
const envMock = vi.hoisted(() => ({}) as Record<string, unknown>);

// Partial mock — real env underneath so the rest of the imported graph keeps
// working; envMock keeps its object identity so per-test mutations stay visible.
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  Object.assign(envMock, actual.env);
  return { env: envMock };
});

import {
  normalizePublicDashboardWidgetInput,
  validatePublicDashboardWidgetInput,
} from "@/src/features/widgets/server/public-dashboard-widget-service";
import { UnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";

const baseInput = {
  name: "API widget",
  description: "",
  view: "observations" as const,
  dimensions: [],
  metrics: [{ measure: "count", agg: "count" as const }],
  filters: [],
  chartType: "BAR_TIME_SERIES" as const,
};

describe("public dashboard widget minVersion", () => {
  describe("legacy write mode, where the events_* tables are empty", () => {
    beforeEach(() => {
      envMock.LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
    });

    it("stamps a v1-expressible widget as v1 so it can render", () => {
      const normalized = normalizePublicDashboardWidgetInput(baseInput);

      expect(normalized.minVersion).toBe(1);
      expect(() =>
        validatePublicDashboardWidgetInput(normalized),
      ).not.toThrow();
    });

    it("rejects a widget that genuinely needs v2 instead of persisting it unrenderable", () => {
      expect(() =>
        normalizePublicDashboardWidgetInput({
          ...baseInput,
          metrics: [{ measure: "traceId", agg: "uniq" as const }],
        }),
      ).toThrow(/v2-only fields/i);
    });

    it("caps a stored v2 widget back to v1 so a patch heals it", () => {
      expect(normalizePublicDashboardWidgetInput(baseInput, 2).minVersion).toBe(
        1,
      );
    });
  });

  // dual writes the events_* tables, so v2 is servable there whatever the
  // preview opt-in says — Monitors ships on exactly that test and its charts
  // are v2-only. Capping here would break them.
  it("keeps stamping v2 in dual write mode with the preview opt-in off", () => {
    envMock.LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
    envMock.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";

    expect(normalizePublicDashboardWidgetInput(baseInput).minVersion).toBe(2);
  });

  it("only suggests dimensions that widget validation accepts", () => {
    envMock.LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
    const normalized = normalizePublicDashboardWidgetInput({
      ...baseInput,
      dimensions: [{ field: "notAViewDimension" }],
    });

    let validationError: unknown;
    try {
      validatePublicDashboardWidgetInput(normalized);
    } catch (error) {
      validationError = error;
    }

    expect(validationError).toBeInstanceOf(UnstablePublicApiError);
    const allowedValues = (validationError as UnstablePublicApiError).details
      ?.allowedValues;
    expect(allowedValues?.length).toBeGreaterThan(0);

    for (const field of allowedValues ?? []) {
      expect(() =>
        validatePublicDashboardWidgetInput({
          ...normalized,
          dimensions: [{ field }],
        }),
      ).not.toThrow();
    }
  });

  it("promotes a v2-required shape despite a persisted v1 lower bound", () => {
    envMock.LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";

    const normalized = normalizePublicDashboardWidgetInput(
      {
        ...baseInput,
        metrics: [{ measure: "traceId", agg: "uniq" as const }],
      },
      1,
    );

    expect(normalized.minVersion).toBe(2);
    expect(() => validatePublicDashboardWidgetInput(normalized)).not.toThrow();
  });
});
