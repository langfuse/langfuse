import {
  createNumericEvalOutputDefinition,
  EvalTargetObject,
  JobConfigState,
} from "@langfuse/shared";
import {
  toApiEvaluationRule,
  toApiEvaluator,
  toJobConfigurationInput,
} from "@/src/features/evals/server/unstable-public-api/adapters";
import { UnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";
import type {
  StoredPublicEvaluationRuleConfig,
  StoredPublicEvaluatorTemplate,
} from "@/src/features/evals/server/unstable-public-api/types";
import {
  GetUnstableEvaluationRulesQuery,
  PatchUnstableEvaluationRuleBody,
  PostUnstableEvaluationRuleBody,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import {
  GetUnstableEvaluatorsQuery,
  PostUnstableEvaluatorBody,
} from "@/src/features/public-api/types/unstable-evaluators";

const numericOutputDefinition = createNumericEvalOutputDefinition({
  reasoningDescription: "Why the score was assigned",
  scoreDescription: "A score between 0 and 1",
});

const expectUnstablePublicApiError = (
  fn: () => unknown,
  params: {
    code: UnstablePublicApiError["code"];
    message?: string;
    details?: Record<string, unknown>;
  },
) => {
  try {
    fn();
    throw new Error("Expected function to throw UnstablePublicApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(UnstablePublicApiError);

    const unstableError = error as UnstablePublicApiError;
    expect(unstableError.code).toBe(params.code);

    if (params.message) {
      expect(unstableError.message).toContain(params.message);
    }

    if (params.details) {
      expect(unstableError.details).toMatchObject(params.details);
    }
  }
};

describe("unstable public eval contracts", () => {
  it("ignores unknown evaluator creation fields for forward compatibility", () => {
    const parsed = PostUnstableEvaluatorBody.parse({
      name: "Answer correctness",
      description: "future field",
      prompt: "Judge {{input}} against {{output}}",
      outputDefinition: numericOutputDefinition,
      modelConfig: {
        provider: "openai",
        model: "gpt-4.1-mini",
        futureSetting: "ignored",
      },
    });

    expect(parsed).toEqual({
      name: "Answer correctness",
      prompt: "Judge {{input}} against {{output}}",
      outputDefinition: {
        dataType: "NUMERIC",
        reasoning: {
          description: "Why the score was assigned",
        },
        score: {
          description: "A score between 0 and 1",
        },
      },
      modelConfig: {
        provider: "openai",
        model: "gpt-4.1-mini",
      },
    });
  });

  it("requires outputDefinition.dataType for evaluator creation", () => {
    const parsed = PostUnstableEvaluatorBody.safeParse({
      name: "Answer correctness",
      prompt: "Judge {{input}} against {{output}}",
      outputDefinition: {
        reasoning: "Explain why the answer is correct or incorrect.",
        score: "Return a score between 0 and 1.",
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["outputDefinition", "dataType"],
        }),
      ]),
    );
  });

  it("rejects observation evaluation rules that use expected_output mappings", () => {
    const parsed = PostUnstableEvaluationRuleBody.safeParse({
      name: "answer_quality",
      evaluator: {
        name: "Answer correctness",
        scope: "project",
      },
      target: "observation",
      enabled: true,
      sampling: 1,
      filter: [],
      mapping: [
        { variable: "output", source: "output" },
        { variable: "expected_output", source: "expected_output" },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["mapping", 1, "source"],
        }),
      ]),
    );
  });

  it("rejects experiment filter updates unless target is provided", () => {
    const parsed = PatchUnstableEvaluationRuleBody.safeParse({
      filter: [
        {
          type: "stringOptions",
          column: "datasetId",
          operator: "any of",
          value: ["dataset-1"],
        },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.length).toBeGreaterThan(0);
  });

  it("rejects non-positive unstable pagination limits", () => {
    expect(
      GetUnstableEvaluatorsQuery.safeParse({
        page: 1,
        limit: 0,
      }).success,
    ).toBe(false);
    expect(
      GetUnstableEvaluationRulesQuery.safeParse({
        page: 1,
        limit: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer unstable pagination values", () => {
    expect(
      GetUnstableEvaluatorsQuery.safeParse({
        page: 1.5,
        limit: 10,
      }).success,
    ).toBe(false);
    expect(
      GetUnstableEvaluationRulesQuery.safeParse({
        page: 1,
        limit: 1.5,
      }).success,
    ).toBe(false);
  });

  it("ignores unknown evaluation rule update fields for forward compatibility", () => {
    const parsed = PatchUnstableEvaluationRuleBody.parse({
      name: "answer_quality",
      newFieldFromFutureVersion: true,
    });

    expect(parsed).toEqual({
      name: "answer_quality",
    });
  });

  it("preserves target-specific patch fields instead of dropping them into the untargeted schema", () => {
    const parsed = PatchUnstableEvaluationRuleBody.parse({
      name: "experiment-expected-output-match",
      target: "experiment",
      filter: [
        {
          type: "stringOptions",
          column: "datasetId",
          operator: "any of",
          value: ["dataset-prod"],
        },
      ],
      mapping: [
        { variable: "output", source: "output" },
        { variable: "expected_output", source: "expected_output" },
      ],
    });

    expect(parsed).toEqual({
      name: "experiment-expected-output-match",
      target: "experiment",
      filter: [
        {
          type: "stringOptions",
          column: "datasetId",
          operator: "any of",
          value: ["dataset-prod"],
        },
      ],
      mapping: [
        { variable: "output", source: "output" },
        { variable: "expected_output", source: "expected_output" },
      ],
    });
  });

  it("rejects invalid target-specific patch payloads instead of silently parsing a name-only subset", () => {
    const parsed = PatchUnstableEvaluationRuleBody.safeParse({
      name: "experiment-expected-output-match",
      target: "experiment",
      filter: [
        {
          type: "stringOptions",
          column: "type",
          operator: "any of",
          value: ["GENERATION"],
        },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.length).toBeGreaterThan(0);
  });
});

describe("unstable public eval adapters", () => {
  it("translates evaluation rule writes into job configuration inputs", () => {
    const writeModel = toJobConfigurationInput({
      input: {
        name: "expected_output_match",
        target: "experiment",
        enabled: false,
        sampling: 0.25,
        filter: [
          {
            type: "stringOptions",
            column: "datasetId",
            operator: "any of",
            value: ["dataset-1"],
          },
        ],
        mapping: [
          { variable: "output", source: "output" },
          { variable: "expected_output", source: "expected_output" },
        ],
      },
      evaluatorVariables: ["output", "expected_output"],
    });

    expect(writeModel).toMatchObject({
      scoreName: "expected_output_match",
      targetObject: EvalTargetObject.EXPERIMENT,
      sampling: 0.25,
      status: JobConfigState.INACTIVE,
      filter: [
        {
          type: "stringOptions",
          column: "experimentDatasetId",
          operator: "any of",
          value: ["dataset-1"],
        },
      ],
      variableMapping: [
        {
          templateVariable: "output",
          selectedColumnId: "output",
          jsonSelector: null,
        },
        {
          templateVariable: "expected_output",
          selectedColumnId: "experimentItemExpectedOutput",
          jsonSelector: null,
        },
      ],
    });
  });

  it("reads legacy expected output mapping column ids without failing", () => {
    const evaluationRule = toApiEvaluationRule({
      id: "ceval_123",
      projectId: "project_123",
      evalTemplateId: "tmpl_project_v2",
      scoreName: "expected_output_match",
      targetObject: EvalTargetObject.EXPERIMENT,
      filter: [],
      variableMapping: [
        {
          templateVariable: "expected_output",
          selectedColumnId: "experiment_item_expected_output",
          jsonSelector: null,
        },
      ],
      sampling: 1,
      status: JobConfigState.ACTIVE,
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
      createdAt: new Date("2026-03-30T08:00:00.000Z"),
      updatedAt: new Date("2026-03-30T08:00:00.000Z"),
      evalTemplate: {
        id: "tmpl_project_v2",
        projectId: "project_123",
        name: "Answer correctness",
        vars: ["expected_output"],
        prompt: "Judge {{expected_output}}",
      },
    } as unknown as StoredPublicEvaluationRuleConfig);

    expect(evaluationRule.mapping).toEqual([
      {
        variable: "expected_output",
        source: "expected_output",
      },
    ]);
  });

  it("rejects invalid static filter option values", () => {
    expectUnstablePublicApiError(
      () =>
        toJobConfigurationInput({
          input: {
            name: "answer_quality",
            target: "observation",
            enabled: true,
            sampling: 1,
            filter: [
              {
                type: "stringOptions",
                column: "type",
                operator: "any of",
                value: ["NOT_A_REAL_TYPE"],
              },
            ],
            mapping: [{ variable: "input", source: "input" }],
          },
          evaluatorVariables: ["input"],
        }),
      {
        code: "invalid_filter_value",
        details: {
          field: "filter[0].value",
          column: "type",
          invalidValues: ["NOT_A_REAL_TYPE"],
        },
      },
    );
  });

  it("rejects malformed jsonPath selectors", () => {
    expectUnstablePublicApiError(
      () =>
        toJobConfigurationInput({
          input: {
            name: "metadata_projection",
            target: "observation",
            enabled: true,
            sampling: 1,
            filter: [],
            mapping: [
              {
                variable: "input",
                source: "metadata",
                jsonPath: "$[",
              },
            ],
          },
          evaluatorVariables: ["input"],
        }),
      {
        code: "invalid_json_path",
        details: {
          field: "mapping[0].jsonPath",
          variable: "input",
          value: "$[",
        },
      },
    );
  });

  it("rejects mapping sources that are incompatible with the selected target", () => {
    expectUnstablePublicApiError(
      () =>
        toJobConfigurationInput({
          input: {
            name: "answer_quality",
            target: "observation",
            enabled: true,
            sampling: 1,
            filter: [],
            mapping: [
              { variable: "expected_output", source: "expected_output" },
            ],
          },
          evaluatorVariables: ["expected_output"],
        }),
      {
        code: "invalid_variable_mapping",
        details: {
          field: "mapping[0].source",
          variable: "expected_output",
        },
      },
    );
  });

  it("rejects missing evaluator variable mappings", () => {
    expectUnstablePublicApiError(
      () =>
        toJobConfigurationInput({
          input: {
            name: "answer_quality",
            target: "observation",
            enabled: true,
            sampling: 1,
            filter: [],
            mapping: [{ variable: "input", source: "input" }],
          },
          evaluatorVariables: ["input", "output"],
        }),
      {
        code: "missing_variable_mapping",
        details: {
          field: "mapping",
          variables: ["output"],
        },
      },
    );
  });

  it("maps evaluator records to exact template versions", () => {
    const template: StoredPublicEvaluatorTemplate = {
      id: "tmpl_latest",
      projectId: null,
      name: "answer-correctness",
      version: 7,
      prompt: "Judge {{input}} against {{output}}",
      partner: "ragas",
      provider: "openai",
      model: "gpt-4.1-mini",
      modelParams: { temperature: 0 },
      vars: ["input", "output"],
      outputDefinition: numericOutputDefinition,
      createdAt: new Date("2026-03-30T08:00:00.000Z"),
      updatedAt: new Date("2026-03-30T09:00:00.000Z"),
    };

    expect(
      toApiEvaluator({
        template,
        evaluationRuleCount: 2,
      }),
    ).toMatchObject({
      id: "tmpl_latest",
      name: "answer-correctness",
      version: 7,
      scope: "managed",
      type: "llm_as_judge",
      outputDefinition: {
        dataType: "NUMERIC",
        reasoning: {
          description: "Why the score was assigned",
        },
        score: {
          description: "A score between 0 and 1",
        },
      },
      modelConfig: {
        provider: "openai",
        model: "gpt-4.1-mini",
      },
      variables: ["input", "output"],
      evaluationRuleCount: 2,
    });
  });

  it("normalizes legacy evaluator output definitions into the public response shape", () => {
    const template: StoredPublicEvaluatorTemplate = {
      id: "tmpl_legacy",
      projectId: "project_123",
      name: "answer-correctness",
      version: 1,
      prompt: "Judge {{input}} against {{output}}",
      partner: null,
      provider: null,
      model: null,
      modelParams: null,
      vars: ["input", "output"],
      outputDefinition: {
        reasoning: "Explain why the answer is correct or incorrect.",
        score: "Return a score between 0 and 1.",
      },
      createdAt: new Date("2026-03-30T08:00:00.000Z"),
      updatedAt: new Date("2026-03-30T09:00:00.000Z"),
    };

    expect(
      toApiEvaluator({
        template,
        evaluationRuleCount: 0,
      }).outputDefinition,
    ).toEqual({
      dataType: "NUMERIC",
      reasoning: {
        description: "Explain why the answer is correct or incorrect.",
      },
      score: {
        description: "Return a score between 0 and 1.",
      },
    });
  });

  it("maps evaluation rules to exact referenced template ids", () => {
    const config: StoredPublicEvaluationRuleConfig = {
      id: "ceval_123",
      projectId: "project_123",
      evalTemplateId: "tmpl_exact",
      scoreName: "answer_quality",
      targetObject: EvalTargetObject.EVENT,
      filter: [],
      variableMapping: [
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: null,
        },
      ],
      sampling: 1,
      status: JobConfigState.ACTIVE,
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
      createdAt: new Date("2026-03-30T08:00:00.000Z"),
      updatedAt: new Date("2026-03-30T09:00:00.000Z"),
      evalTemplate: {
        id: "tmpl_exact",
        projectId: "project_123",
        name: "Answer correctness",
        vars: ["input"],
        prompt: "Judge {{input}}",
      },
    };

    expect(toApiEvaluationRule(config)).toMatchObject({
      evaluator: {
        id: "tmpl_exact",
        name: "Answer correctness",
        scope: "project",
      },
      target: "observation",
      enabled: true,
      status: "active",
    });
  });
});
