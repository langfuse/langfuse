// @vitest-environment node

import {
  EvalTargetObject,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { resolveCheckboxOperator } from "@/src/features/filters/hooks/useSidebarFilterState";
import { evalConfigFilterColumns } from "@/src/server/api/definitions/evalConfigsTable";
import {
  DEFAULT_OBSERVATION_FILTER,
  DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING,
  DEFAULT_TRACE_FILTER,
} from "@/src/features/evals/utils/evaluator-constants";

describe("eval config target behavior", () => {
  it("should exclude all non-trace targets when selecting trace", () => {
    const targetColumn = evalConfigFilterColumns.find(
      (col) => col.id === "target",
    );

    expect(targetColumn?.type).toBe("stringOptions");

    const availableValues =
      targetColumn?.type === "stringOptions"
        ? targetColumn.options.map((option) => option.value)
        : [];

    expect(availableValues).toEqual(
      expect.arrayContaining(Object.values(EvalTargetObject)),
    );

    const result = resolveCheckboxOperator({
      colType: "stringOptions",
      existingFilter: undefined,
      values: [EvalTargetObject.TRACE],
      availableValues,
    });

    expect(result).toEqual({
      finalOperator: "none of",
      finalValues: expect.arrayContaining([
        EvalTargetObject.DATASET,
        EvalTargetObject.EVENT,
        EvalTargetObject.EXPERIMENT,
      ]),
    });
  });

  it("keeps internal environment exclusions in legacy evaluator defaults", () => {
    const environmentFilter = {
      column: "environment",
      operator: "none of",
      value: [
        LangfuseInternalTraceEnvironment.LLMJudge,
        LangfuseInternalTraceEnvironment.CodeEval,
        LangfuseInternalTraceEnvironment.NaturalLanguageFilter,
        "langfuse-prompt-experiment",
        "langfuse-evaluation",
        "sdk-experiment",
      ],
      type: "stringOptions",
    };

    expect(DEFAULT_TRACE_FILTER).toEqual([environmentFilter]);
    expect(DEFAULT_OBSERVATION_FILTER).toEqual([
      {
        column: "type",
        operator: "any of",
        value: ["GENERATION"],
        type: "stringOptions",
      },
      environmentFilter,
    ]);
  });

  it("uses semantic roots when remapping trace evaluators", () => {
    expect(DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING).toEqual([
      {
        column: "isRootObservation",
        operator: "=",
        value: true,
        type: "boolean",
      },
    ]);
  });
});
