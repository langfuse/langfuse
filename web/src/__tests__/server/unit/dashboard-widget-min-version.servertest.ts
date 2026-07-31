// The public widget API validates shape compatibility against the deployment
// write mode. DashboardService owns the persisted version after normalization.
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

describe("public dashboard widget version validation", () => {
  describe("legacy write mode, where the events_* tables are empty", () => {
    beforeEach(() => {
      envMock.LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
    });

    it("accepts a v1-expressible widget so it can render", () => {
      const normalized = normalizePublicDashboardWidgetInput(baseInput);

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
  });

  // dual writes the events_* tables, so the server can choose v2 there whatever
  // the preview opt-in says — Monitors ships on exactly that deployment mode.
  it("accepts a v1-expressible shape in dual write mode", () => {
    envMock.LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
    envMock.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";

    expect(() =>
      validatePublicDashboardWidgetInput(
        normalizePublicDashboardWidgetInput(baseInput),
      ),
    ).not.toThrow();
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

  it("validates a v2-required shape without a caller-supplied version", () => {
    envMock.LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";

    const normalized = normalizePublicDashboardWidgetInput({
      ...baseInput,
      metrics: [{ measure: "traceId", agg: "uniq" as const }],
    });

    expect(() => validatePublicDashboardWidgetInput(normalized)).not.toThrow();
  });
});
