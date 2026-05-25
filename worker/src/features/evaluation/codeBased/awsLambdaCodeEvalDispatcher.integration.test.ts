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
  },
  runtime: { language: "TYPESCRIPT" },
  execution: { jobExecutionId: "job-floci-integration" },
  code: { source: "function evaluate() {}" },
  payload: {
    observation: {
      input: "hello",
      output: "hello world",
      metadata: { topic: "integration" },
    },
    experiment: {
      expectedOutput: "hello world",
      itemMetadata: { item: 42 },
    },
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
  {
    name: "expected-output",
    value: "hello world",
    dataType: "TEXT",
    metadata: { source: "runner-fixture" },
  },
  { name: "rating", value: "good", dataType: "CATEGORICAL" },
] as const;

const sources: Record<CodeEvalRuntimeLanguage, string> = {
  TYPESCRIPT: `
function evaluate(ctx: {
  observation: {
    input: string;
    output: string;
    metadata: { topic: string };
  };
  experiment: {
    expectedOutput: string;
    itemMetadata: { item: number };
  } | undefined;
}) {
  const contains = ctx.observation.output.includes(ctx.observation.input);
  return {
    scores: [
      { name: "output-contains-input-bool", value: contains, dataType: "BOOLEAN" },
      { name: "output-contains-input-int", value: contains ? 1 : 0, dataType: "BOOLEAN" },
      { name: "output-contains-input-str", value: contains ? "True" : "False", dataType: "BOOLEAN" },
      { name: ctx.observation.metadata.topic, value: ctx.experiment?.itemMetadata.item ?? 0, dataType: "NUMERIC" },
      { name: "expected-output", value: ctx.experiment?.expectedOutput ?? "", dataType: "TEXT", metadata: { source: "runner-fixture" } },
      { name: "rating", value: "good", dataType: "CATEGORICAL" },
    ],
  };
}
`,
  PYTHON: `
def evaluate(ctx):
    contains = ctx.observation.input in ctx.observation.output
    return {
        "scores": [
            {"name": "output-contains-input-bool", "value": contains, "dataType": "BOOLEAN"},
            {"name": "output-contains-input-int", "value": 1 if contains else 0, "dataType": "BOOLEAN"},
            {"name": "output-contains-input-str", "value": "true" if contains else "false", "dataType": "BOOLEAN"},
            {"name": ctx.observation.metadata["topic"], "value": ctx.experiment.item_metadata["item"], "dataType": "NUMERIC"},
            Score(name="expected-output", value=ctx.experiment.expected_output, data_type="TEXT", metadata={"source": "runner-fixture"}),
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
          source: `function evaluate() { throw new Error("boom") }`,
        },
      }),
    ).rejects.toMatchObject({
      code: "USER_CODE_ERROR",
      message: "boom",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });
});
