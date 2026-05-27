import { EvalTargetObject, JobConfigState } from "@langfuse/shared";
import {
  buildCloneScoreName,
  buildClonedEvaluatorConfig,
  CLONED_EVALUATOR_SCORE_NAME_SUFFIX,
} from "@/src/features/evals/utils/clone-evaluator-config";
import { type PartialConfig } from "@/src/features/evals/types";

const baseConfig: PartialConfig = {
  scoreName: "quality-score",
  targetObject: EvalTargetObject.EVENT,
  filter: [
    {
      type: "string",
      column: "name",
      operator: "contains",
      value: "test",
    },
  ],
  variableMapping: [
    {
      templateVariable: "input",
      selectedColumnId: "input",
      jsonSelector: null,
    },
  ],
  sampling: { toNumber: () => 0.5 } as PartialConfig["sampling"],
  delay: { toNumber: () => 5000 } as PartialConfig["delay"],
  timeScope: ["NEW", "EXISTING"],
  status: JobConfigState.ACTIVE,
};

describe("buildCloneScoreName", () => {
  it("appends the copy suffix to score names", () => {
    expect(buildCloneScoreName("quality-score")).toBe(
      `quality-score${CLONED_EVALUATOR_SCORE_NAME_SUFFIX}`,
    );
  });

  it("does not append the suffix twice", () => {
    expect(
      buildCloneScoreName(`quality-score${CLONED_EVALUATOR_SCORE_NAME_SUFFIX}`),
    ).toBe(`quality-score${CLONED_EVALUATOR_SCORE_NAME_SUFFIX}`);
  });
});

describe("buildClonedEvaluatorConfig", () => {
  it("copies evaluator settings with inactive clone defaults", () => {
    const cloned = buildClonedEvaluatorConfig(baseConfig);

    expect(cloned).toEqual({
      scoreName: `quality-score${CLONED_EVALUATOR_SCORE_NAME_SUFFIX}`,
      targetObject: EvalTargetObject.EVENT,
      filter: baseConfig.filter,
      variableMapping: baseConfig.variableMapping,
      sampling: baseConfig.sampling,
      delay: baseConfig.delay,
      timeScope: ["NEW"],
      status: JobConfigState.INACTIVE,
    });
  });
});
