// @vitest-environment node

import { describe, expect, it } from "vitest";

import { filterOperators, type FilterState } from "@langfuse/shared";

import {
  getMetricsColumnsWithCustomSelect,
  getMetricsFilterColumns,
} from "@/src/features/metrics/metricsFilterColumns";

import { __test } from "./MetricsFilterBuilder";

const {
  buildV2FilterColumnsParams,
  viewFiltersToEditorFilters,
  editorFiltersToViewFilters,
  resolvesToColumn,
} = __test;

const modelFilter = (column: string): FilterState[number] => ({
  column,
  type: "stringOptions",
  operator: "any of",
  value: ["gpt-4"],
});

describe("editorFiltersToViewFilters", () => {
  it("canonical view row: round-trips through the editor unchanged", () => {
    const filters: FilterState = [modelFilter("providedModelName")];
    expect(
      editorFiltersToViewFilters(
        "observations",
        viewFiltersToEditorFilters("observations", filters),
      ),
    ).toEqual(filters);
  });

  it("legacy UI-table column: canonicalizes to the view dimension name", () => {
    expect(
      editorFiltersToViewFilters("observations", [modelFilter("Model")]),
    ).toEqual([modelFilter("providedModelName")]);
  });

  it("unmapped column: preserved verbatim, never dropped", () => {
    const filters: FilterState = [modelFilter("totallyUnknownColumn")];
    expect(editorFiltersToViewFilters("observations", filters)).toEqual(
      filters,
    );
    expect(
      editorFiltersToViewFilters(
        "observations",
        viewFiltersToEditorFilters("observations", filters),
      ),
    ).toEqual(filters);
  });

  it("canonicalizes current and legacy evaluator display labels", () => {
    const canonical: FilterState = [
      {
        column: "evaluatorId",
        type: "string",
        operator: "=",
        value: "evaluator-1",
      },
    ];
    for (const column of ["Evaluator", "Evaluator ID"]) {
      expect(
        editorFiltersToViewFilters("observations", [
          {
            ...canonical[0],
            column,
          },
        ]),
      ).toEqual(canonical);
    }
    expect(
      editorFiltersToViewFilters("observations", [
        {
          column: "Evaluator execution",
          type: "boolean",
          operator: "=",
          value: false,
        },
      ]),
    ).toEqual([
      {
        column: "isEvaluatorTest",
        type: "boolean",
        operator: "=",
        value: false,
      },
    ]);
  });
});

describe("resolvesToColumn", () => {
  const columnsFor = (
    view: "observations" | "scores-categorical",
    viewVersion: "v1" | "v2" = "v2",
  ) =>
    getMetricsFilterColumns({
      ...buildV2FilterColumnsParams({
        view,
        filterOptions: undefined,
        datasets: undefined,
      }),
      viewVersion,
    });

  const resolves = (
    column: string,
    view: "observations" | "scores-categorical",
    viewVersion: "v1" | "v2" = "v2",
  ) => resolvesToColumn(modelFilter(column), columnsFor(view, viewVersion));

  it("column on the view: resolves by canonical id and by display name", () => {
    expect(resolves("providedModelName", "observations")).toBe(true);
    expect(resolves("Model", "observations")).toBe(true);
  });

  it("column absent from the view: does not resolve in either spelling", () => {
    expect(resolves("providedModelName", "scores-categorical")).toBe(false);
    expect(resolves("Model", "scores-categorical")).toBe(false);
  });

  it("v2-only column on v1: does not resolve", () => {
    expect(resolves("isRootObservation", "observations", "v2")).toBe(true);
    expect(resolves("isRootObservation", "observations", "v1")).toBe(false);
  });

  it("offers an is-not-empty operator for evaluator IDs", () => {
    const evaluatorColumn = columnsFor("observations").find(
      (column) => column.id === "evaluatorId",
    );

    expect(evaluatorColumn?.type).toBe("string");
    expect(filterOperators.string).toContain("is not empty");
  });

  it("renders evaluator alert prefill filters", () => {
    expect(resolves("evaluatorId", "observations", "v1")).toBe(true);
    expect(resolves("evaluatorId", "observations", "v2")).toBe(true);
    expect(resolves("isEvaluatorTest", "observations", "v2")).toBe(true);
    expect(resolves("evaluatorId", "scores-categorical", "v2")).toBe(true);
    expect(resolves("isEvaluatorTest", "scores-categorical", "v2")).toBe(true);
  });

  it("unmapped column: does not resolve", () => {
    expect(resolves("totallyUnknownColumn", "observations")).toBe(false);
  });

  it("saved trace-spelling rows: resolve onto the v2 observations pair", () => {
    for (const column of [
      "traceRelease",
      "Trace Release",
      "traceVersion",
      "Trace Version",
    ]) {
      expect(resolves(column, "observations")).toBe(true);
    }
  });
});

describe("buildV2FilterColumnsParams", () => {
  const getColumn = (
    view: "observations",
    id: string,
    viewVersion?: "v1" | "v2",
  ) => {
    const params = buildV2FilterColumnsParams({
      view,
      filterOptions: undefined,
      datasets: undefined,
    });
    return getMetricsFilterColumns({
      ...params,
      viewVersion: viewVersion ?? params.viewVersion,
    }).find((c) => c.id === id);
  };

  it("offers every Observation Type value even when discovery data is empty", () => {
    const typeColumn = getColumn("observations", "type");
    expect(typeColumn?.type).toBe("stringOptions");
    const values =
      typeColumn?.type === "stringOptions"
        ? typeColumn.options.map((o) => o.value)
        : [];
    expect(values).toContain("TOOL");
    expect(values).toContain("GENERATION");
    expect(values.length).toBeGreaterThan(0);
  });

  it("offers every Observation Level value even when discovery data is empty", () => {
    const levelColumn = getColumn("observations", "level");
    expect(levelColumn?.type).toBe("stringOptions");
    const values =
      levelColumn?.type === "stringOptions"
        ? levelColumn.options.map((o) => o.value)
        : [];
    expect(values).toContain("ERROR");
    expect(values).toContain("WARNING");
    expect(values.length).toBeGreaterThan(0);
  });

  it("maps filterOptions.name into a searchable Observation Name stringOptions column", () => {
    const params = buildV2FilterColumnsParams({
      view: "observations",
      filterOptions: {
        name: [{ value: "generation-alpha" }, { value: "generation-beta" }],
      } as Parameters<typeof buildV2FilterColumnsParams>[0]["filterOptions"],
      datasets: undefined,
    });
    const column = getMetricsFilterColumns(params).find(
      (c) => c.id === "observationName",
    );
    expect(column?.type).toBe("stringOptions");
    const values =
      column?.type === "stringOptions"
        ? column.options.map((o) => o.value)
        : [];
    expect(values).toEqual(["generation-alpha", "generation-beta"]);
    expect(getMetricsColumnsWithCustomSelect(params)).toContain(
      "observationName",
    );
  });

  it("maps user/session/version/release into searchable stringOptions columns", () => {
    const params = buildV2FilterColumnsParams({
      view: "observations",
      filterOptions: {
        userId: [{ value: "user-1" }],
        sessionId: [{ value: "session-1" }],
        version: [{ value: "1.0.0" }],
        release: [{ value: "2024-01" }],
      } as Parameters<typeof buildV2FilterColumnsParams>[0]["filterOptions"],
      datasets: undefined,
    });
    const columns = getMetricsFilterColumns(params);
    const custom = getMetricsColumnsWithCustomSelect(params);

    for (const id of ["user", "session", "version", "release"]) {
      const column = columns.find((c) => c.id === id);
      expect(column?.type).toBe("stringOptions");
      expect(custom).toContain(id);
    }
    const userColumn = columns.find((c) => c.id === "user");
    const userValues =
      userColumn?.type === "stringOptions"
        ? userColumn.options.map((o) => o.value)
        : [];
    expect(userValues).toEqual(["user-1"]);
  });

  it("labels Experiment ID options by name via displayValue", () => {
    const params = buildV2FilterColumnsParams({
      view: "observations",
      filterOptions: {
        experimentId: [{ value: "exp-1", displayValue: "My Experiment" }],
      } as Parameters<typeof buildV2FilterColumnsParams>[0]["filterOptions"],
      datasets: undefined,
    });
    const column = getMetricsFilterColumns(params).find(
      (c) => c.id === "experimentId",
    );
    expect(column?.type).toBe("stringOptions");
    const options = column?.type === "stringOptions" ? column.options : [];
    expect(options).toEqual([
      { value: "exp-1", displayValue: "My Experiment" },
    ]);
    expect(getMetricsColumnsWithCustomSelect(params)).toContain("experimentId");
  });

  it("labels evaluator ID suggestions by name while retaining ID values", () => {
    const params = buildV2FilterColumnsParams({
      view: "observations",
      filterOptions: undefined,
      datasets: undefined,
      evaluatorOptions: [
        { value: "evaluator-1", displayValue: "Answer quality" },
      ],
    });
    const column = getMetricsFilterColumns(params).find(
      (candidate) => candidate.id === "evaluatorId",
    );

    expect(column?.name).toBe("Evaluator");
    expect(column?.type).toBe("string");
    expect(column && "options" in column ? column.options : []).toEqual([
      { value: "evaluator-1", displayValue: "Answer quality" },
    ]);
    expect(getMetricsColumnsWithCustomSelect(params)).toContain("evaluatorId");
  });

  it("wires metadata key suggestions into the Metadata column", () => {
    const params = buildV2FilterColumnsParams({
      view: "observations",
      filterOptions: undefined,
      datasets: undefined,
      metadataKeys: ["region", "tier"],
    });
    const column = getMetricsFilterColumns(params).find(
      (c) => c.id === "metadata",
    );
    expect(column?.type).toBe("stringObject");
    const keyOptions =
      column?.type === "stringObject" ? column.keyOptions : undefined;
    expect(keyOptions).toEqual(["region", "tier"]);
    expect(getMetricsColumnsWithCustomSelect(params)).toContain("metadata");
  });

  it("keeps Type/Level as non-searchable columns", () => {
    const params = buildV2FilterColumnsParams({
      view: "observations",
      filterOptions: undefined,
      datasets: undefined,
    });
    const custom = getMetricsColumnsWithCustomSelect(params);
    expect(custom).not.toContain("type");
    expect(custom).not.toContain("level");
  });

  it("boolean score view: offers booleanValue instead of value", () => {
    const booleanParams = buildV2FilterColumnsParams({
      view: "scores-boolean",
      filterOptions: undefined,
      datasets: undefined,
    });
    const booleanColumns = getMetricsFilterColumns(booleanParams);
    expect(
      booleanColumns.find((column) => column.id === "booleanValue")?.type,
    ).toBe("boolean");
    expect(booleanColumns.some((column) => column.id === "value")).toBe(false);

    const numericParams = buildV2FilterColumnsParams({
      view: "scores-numeric",
      filterOptions: undefined,
      datasets: undefined,
    });
    expect(
      getMetricsFilterColumns(numericParams).some(
        (column) => column.id === "booleanValue",
      ),
    ).toBe(false);
  });

  it("trace-level release/version pair: offered on v1 only", () => {
    expect(getColumn("observations", "traceRelease", "v1")).toMatchObject({
      name: "Trace Release",
    });
    expect(getColumn("observations", "traceVersion", "v1")).toMatchObject({
      name: "Trace Version",
    });
    expect(getColumn("observations", "traceRelease")).toBeUndefined();
    expect(getColumn("observations", "traceVersion")).toBeUndefined();
    expect(getColumn("observations", "release")).toMatchObject({
      name: "Release",
    });
    expect(getColumn("observations", "version")).toMatchObject({
      name: "Version",
    });
  });

  it("semantic-root filtering: offered for v2 observations only", () => {
    expect(getColumn("observations", "isRootObservation")).toMatchObject({
      name: "Is Root Observation",
      type: "boolean",
    });
    expect(
      getColumn("observations", "isRootObservation", "v1"),
    ).toBeUndefined();
  });
});
