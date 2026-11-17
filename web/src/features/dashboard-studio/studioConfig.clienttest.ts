import { type StudioQuery, StudioWidgetConfigSchema } from "@langfuse/shared";
import { createStudioWidget } from "./catalog";
import { resolveStudioQueryVersion, withStudioQueries } from "./studioConfig";

describe("studio configuration edits", () => {
  it("keeps view and headline references valid after query and metric removal", () => {
    const config = createStudioWidget();
    const a = config.queries[0]!;
    const b: StudioQuery = { ...a, id: "b" };
    config.queries = [a, b];
    config.display.activeQueryIds = ["a"];
    config.display.headlineMetricRef = "a.count";
    const withoutA = withStudioQueries(config, [b]);
    expect(withoutA.display.activeQueryIds).toBeUndefined();
    expect(withoutA.display.headlineMetricRef).toBeUndefined();
    expect(StudioWidgetConfigSchema.safeParse(withoutA).success).toBe(true);
    config.display.activeQueryIds = ["a", "b"];
    const renamedMetric = {
      ...a,
      metrics: [{ ...a.metrics[0]!, id: "renamed" }],
    };
    const changed = withStudioQueries(config, [renamedMetric, b]);
    expect(changed.display.activeQueryIds).toEqual(["a", "b"]);
    expect(changed.display.headlineMetricRef).toBeUndefined();
    expect(StudioWidgetConfigSchema.safeParse(changed).success).toBe(true);
  });

  it("preserves compatible headline bindings", () => {
    const config = createStudioWidget();
    config.display.headlineMetricRef = "a.count";
    const changed = withStudioQueries(config, [
      { ...config.queries[0]!, label: "Renamed population" },
    ]);
    expect(changed.display.headlineMetricRef).toBe("a.count");
  });
});

describe("studio execution version", () => {
  it("keeps common shapes on v1 unless the viewer is using v2", () => {
    expect(resolveStudioQueryVersion(createStudioWidget(), "v1", [])).toBe(
      "v1",
    );
    expect(resolveStudioQueryVersion(createStudioWidget(), "v2", [])).toBe(
      "v2",
    );
  });

  it.each(["measure", "dimension", "filter", "dashboard filter"] as const)(
    "escalates a saved v2-only %s when the viewer uses v1",
    (field) => {
      const config = createStudioWidget();
      const query = config.queries[0]!;
      const filter = {
        type: "string" as const,
        column: "costType",
        operator: "=" as const,
        value: "input",
      };
      if (field === "measure")
        query.metrics = [
          { id: "cost", measure: "costByType", aggregation: "sum" },
        ];
      if (field === "dimension") query.dimensions = [{ field: "usageType" }];
      if (field === "filter") query.filters = [filter];
      expect(
        resolveStudioQueryVersion(
          config,
          "v1",
          field === "dashboard filter" ? [filter] : [],
        ),
      ).toBe("v2");
    },
  );
});
