import {
  normalizePublicDashboardWidgetInput,
  validatePublicDashboardWidgetInput,
} from "@/src/features/widgets/server/public-dashboard-widget-service";
import { UnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";
import { env as sharedEnv } from "@langfuse/shared/src/env";

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
  const originalWriteMode = sharedEnv.LANGFUSE_MIGRATION_V4_WRITE_MODE;
  const setWriteMode = (mode: "legacy" | "dual") => {
    sharedEnv.LANGFUSE_MIGRATION_V4_WRITE_MODE = mode;
  };

  afterEach(() => {
    sharedEnv.LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
  });

  describe("legacy write mode, where the events_* tables are empty", () => {
    beforeEach(() => {
      setWriteMode("legacy");
    });

    it("accepts a v1-expressible widget so it can render", () => {
      const normalized = normalizePublicDashboardWidgetInput(baseInput);

      expect(() =>
        validatePublicDashboardWidgetInput(normalized),
      ).not.toThrow();
    });

    it("rejects a widget that genuinely needs v2 instead of persisting it unrenderable", () => {
      expect(() =>
        validatePublicDashboardWidgetInput(
          normalizePublicDashboardWidgetInput({
            ...baseInput,
            metrics: [{ measure: "traceId", agg: "uniq" as const }],
          }),
        ),
      ).toThrow(/v2-only fields/i);
    });

    it("rejects a semantic-root filter instead of persisting a v1 widget", () => {
      expect(() =>
        validatePublicDashboardWidgetInput(
          normalizePublicDashboardWidgetInput({
            ...baseInput,
            filters: [
              {
                column: "isRootObservation",
                type: "boolean",
                operator: "=",
                value: true,
              },
            ],
          }),
        ),
      ).toThrow(/v2-only fields/i);
    });
  });

  it("only suggests dimensions that widget validation accepts", () => {
    setWriteMode("dual");
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

  it("validates public widgets against the minimum version required by their shape", () => {
    setWriteMode("dual");

    expect(() =>
      validatePublicDashboardWidgetInput(
        normalizePublicDashboardWidgetInput({
          ...baseInput,
          // `id` is available to v1 widgets but uiHidden in v2.
          dimensions: [{ field: "id" }],
        }),
      ),
    ).not.toThrow();

    expect(() =>
      validatePublicDashboardWidgetInput(
        normalizePublicDashboardWidgetInput({
          ...baseInput,
          metrics: [{ measure: "traceId", agg: "uniq" as const }],
        }),
      ),
    ).not.toThrow();
  });

  it("promotes a semantic-root filter to v2 on a dual deployment", () => {
    setWriteMode("dual");

    const normalized = normalizePublicDashboardWidgetInput({
      ...baseInput,
      filters: [
        {
          column: "isRootObservation",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ],
    });

    expect(() => validatePublicDashboardWidgetInput(normalized)).not.toThrow();
  });
});
