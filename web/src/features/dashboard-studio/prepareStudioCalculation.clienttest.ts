import { describe, expect, it } from "vitest";
import { type StudioResult } from "@langfuse/shared";
import { createStudioWidget } from "./catalog";
import { prepareStudioCalculation } from "./prepareStudioCalculation";

describe("studio calculation preview", () => {
  it("aligns the latest returned operands by bucket and complete dimensions without inventing missing values", () => {
    const config = createStudioWidget();
    config.queries = ["errors", "all"].map((id) => ({
      ...config.queries[0]!,
      id,
      label: id === "errors" ? "Errors" : "All observations",
      hidden: true,
    }));
    config.expressions = [
      {
        id: "rate",
        label: "Error rate",
        formula: "errors.count / all.count",
        unit: "percent",
      },
    ];
    const result: StudioResult = {
      status: "complete",
      rows: [],
      summaries: [],
      series: [],
      diagnostics: [],
      warnings: [],
    };
    for (const [time, client, values] of [
      ["2026-11-18", "A", [1, 10, 0.1]],
      ["2026-11-19", "B", [0, undefined, null]],
      ["2026-11-19", "A", [7, 400, 0.0175]],
      ["2026-11-20", "A", [undefined, undefined, null]],
    ] as const) {
      ["errors", "all", "rate"].forEach((queryId, index) => {
        const value = values[index];
        if (value === undefined) return;
        const metricId = queryId === "rate" ? "rate" : "count";
        const seriesId = `${queryId}.${metricId}:${client}`;
        const dimensions =
          index === 1
            ? { client, model: "Model one" }
            : { model: "Model one", client };
        result.rows.push({
          seriesId,
          queryId,
          metricId,
          label: queryId,
          dimension: client,
          dimensions,
          time,
          value,
        });
        if (!result.series.some((series) => series.id === seriesId))
          result.series.push({
            id: seriesId,
            queryId,
            metricId,
            label: queryId,
            dimensions,
            aggregation: "count",
            unit: queryId === "rate" ? "ratio" : "observations",
          });
      });
    }
    const preview = prepareStudioCalculation(config, result)!;
    expect(preview.point?.time).toBe("2026-11-19");
    expect(preview.point?.dimensions.client).toBe("A");
    expect(preview.formula).toBe("A / B");
    expect(
      preview.terms.map((term) => [term.token, term.value, term.unit]),
    ).toEqual([
      ["A", 7, "observations"],
      ["B", 400, "observations"],
      ["C", 0.0175, "percent"],
    ]);
    expect(preview.terms[0]?.hidden).toBe(true);
    const missing = prepareStudioCalculation(
      config,
      result,
      "rate",
      preview.points.find((point) => point.label.includes("Client: B"))!.value,
    )!;
    expect(missing.terms.map((term) => term.value)).toEqual([
      0,
      undefined,
      null,
    ]);
    const scalar = prepareStudioCalculation(config, {
      ...result,
      rows: [],
      summaries: result.rows
        .filter(
          (row) => row.time === "2026-11-19" && row.dimensions.client === "A",
        )
        .map((row) => ({
          ...row,
          time: null,
          dimensions: {},
          dimension: null,
        })),
    })!;
    expect(scalar.scope).toBe("summaries");
    expect(scalar.point?.label).toBe("Full returned period");
    expect(scalar.terms.at(-1)?.value).toBe(0.0175);
    const number = prepareStudioCalculation(
      { ...config, display: { chartType: "NUMBER" } },
      {
        ...result,
        summaries: result.rows
          .filter(
            (row) => row.time === "2026-11-19" && row.dimensions.client === "A",
          )
          .map((row) => ({
            ...row,
            time: null,
            dimensions: {},
            dimension: null,
          })),
      },
    )!;
    expect(number.point?.label).toBe("Full returned period");
    expect(number.scope).toBe("summaries");
    config.expressions.push({
      id: "twice",
      label: "Twice the rate",
      formula: "rate * 2",
    });
    const absent = prepareStudioCalculation(config, result, "twice")!;
    expect(absent.terms.map((term) => term.reference)).toEqual([
      "rate",
      "twice",
    ]);
    expect(absent.terms.at(-1)?.value).toBeUndefined();
    expect(
      prepareStudioCalculation({ ...config, expressions: [] }, result),
    ).toBeNull();
  });
});
