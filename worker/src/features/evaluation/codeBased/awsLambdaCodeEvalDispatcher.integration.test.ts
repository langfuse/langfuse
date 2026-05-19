import { describe, expect, it } from "vitest";
import {
  AwsLambdaCodeEvalDispatcher,
  CodeEvalDispatcherError,
  type CodeEvalRuntimeLanguage,
  type DispatchInput,
} from "@langfuse/shared/src/server";

const endpoint = process.env.LANGFUSE_CODE_EVAL_AWS_LAMBDA_ENDPOINT;
const describeWithFloci = endpoint ? describe : describe.skip;

process.env.AWS_ACCESS_KEY_ID ??= "test";
process.env.AWS_SECRET_ACCESS_KEY ??= "test";
process.env.AWS_REGION ??= "us-east-1";

const baseInput: DispatchInput = {
  scope: {
    organizationId: "org-floci-integration",
    projectId: "project-floci-integration",
    evaluatorId: "evaluator-floci-integration",
    environment: "code-based-eval",
  },
  runtime: { language: "TYPESCRIPT" },
  execution: { jobExecutionId: "job-floci-integration" },
  code: { source: "export function evaluate() {}" },
  payload: {
    input: "hello",
    output: "hello world",
    observationMetadata: { topic: "integration" },
    experimentExpectedOutput: "hello world",
    experimentItemMetadata: { item: 42 },
  },
};

// Each runner returns the same logical scores so we can share assertions.
// BOOLEAN variants cover every accepted input shape: native boolean,
// already-encoded 0/1, and string form ("true"). All normalize to 1.
const expectedScores = [
  { name: "output-contains-input-bool", value: 1, dataType: "BOOLEAN" },
  { name: "output-contains-input-int", value: 1, dataType: "BOOLEAN" },
  { name: "output-contains-input-str", value: 1, dataType: "BOOLEAN" },
  { name: "integration", value: 42, dataType: "NUMERIC" },
  { name: "expected-output", value: "hello world", dataType: "TEXT" },
  { name: "rating", value: "good", dataType: "CATEGORICAL" },
] as const;

const sources: Record<CodeEvalRuntimeLanguage, string> = {
  TYPESCRIPT: `
export function evaluate(ctx: {
  input: string;
  output: string;
  observationMetadata: { topic: string };
  experimentExpectedOutput: string;
  experimentItemMetadata: { item: number };
}) {
  const contains = ctx.output.includes(ctx.input);
  return {
    scores: [
      { name: "output-contains-input-bool", value: contains, dataType: "BOOLEAN" },
      { name: "output-contains-input-int", value: contains ? 1 : 0, dataType: "BOOLEAN" },
      { name: "output-contains-input-str", value: contains ? "True" : "False", dataType: "BOOLEAN" },
      { name: ctx.observationMetadata.topic, value: ctx.experimentItemMetadata.item, dataType: "NUMERIC" },
      { name: "expected-output", value: ctx.experimentExpectedOutput, dataType: "TEXT" },
      { name: "rating", value: "good", dataType: "CATEGORICAL" },
    ],
  };
}
`,
  PYTHON: `
def evaluate(ctx):
    contains = ctx.input in ctx.output
    return {
        "scores": [
            {"name": "output-contains-input-bool", "value": contains, "dataType": "BOOLEAN"},
            {"name": "output-contains-input-int", "value": 1 if contains else 0, "dataType": "BOOLEAN"},
            {"name": "output-contains-input-str", "value": "true" if contains else "false", "dataType": "BOOLEAN"},
            {"name": ctx.observation_metadata["topic"], "value": ctx.experiment_item_metadata["item"], "dataType": "NUMERIC"},
            {"name": "expected-output", "value": ctx.experiment_expected_output, "dataType": "TEXT"},
            {"name": "rating", "value": "good", "dataType": "CATEGORICAL"},
        ],
    }
`,
};

describeWithFloci("AwsLambdaCodeEvalDispatcher Floci integration", () => {
  const dispatcher = new AwsLambdaCodeEvalDispatcher({ endpoint });

  it.each<CodeEvalRuntimeLanguage>(["TYPESCRIPT", "PYTHON"])(
    "passes the payload and returns all score types for the %s runner",
    async (language) => {
      await expect(
        dispatcher.dispatch({
          ...baseInput,
          runtime: { language },
          code: { source: sources[language] },
        }),
      ).resolves.toEqual({ scores: expectedScores });
    },
  );

  it("preserves runner error classifications", async () => {
    await expect(
      dispatcher.dispatch({
        ...baseInput,
        runtime: { language: "TYPESCRIPT" },
        code: {
          source: `export function evaluate() { throw new Error("boom") }`,
        },
      }),
    ).rejects.toMatchObject({
      code: "USER_CODE_ERROR",
      message: "boom",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });
});
