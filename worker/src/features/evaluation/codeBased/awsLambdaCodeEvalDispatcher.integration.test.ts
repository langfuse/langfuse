import { describe, expect, it } from "vitest";
import {
  AwsLambdaCodeEvalDispatcher,
  CodeEvalDispatcherError,
  type CodeEvalRuntimeLanguage,
  type DispatchInput,
} from "@langfuse/shared/src/server";

const endpoint = process.env.LANGFUSE_CODE_EVAL_AWS_LAMBDA_ENDPOINT;
const describeWithFloci = endpoint ? describe : describe.skip;
const FLOCI_TEST_TIMEOUT_MS = 30_000;

// Floci enforces IAM, so the dev env's placeholder Bedrock keys are rejected.
if (endpoint) {
  process.env.AWS_ACCESS_KEY_ID = "test";
  process.env.AWS_SECRET_ACCESS_KEY = "test";
}
if (process.env.AWS_REGION === undefined) {
  process.env.AWS_REGION = "us-east-1";
}

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
    targetType: "observation",
    observation: {
      input: "hello",
      output: "hello world",
      metadata: { topic: "integration" },
      toolCalls: [],
    },
    experiment: {
      itemExpectedOutput: "hello world",
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
  {
    name: "rating",
    value: "good",
    dataType: "CATEGORICAL",
    configId: "rating-config",
  },
  { name: "untyped", value: "fallback" },
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
    itemExpectedOutput: string;
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
      { name: "expected-output", value: ctx.experiment?.itemExpectedOutput ?? "", dataType: "TEXT", metadata: { source: "runner-fixture" } },
      { name: "rating", value: "good", dataType: "CATEGORICAL", configId: "rating-config" },
      { name: "untyped", value: "fallback" },
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
            Score(name="expected-output", value=ctx.experiment.item_expected_output, data_type="TEXT", metadata={"source": "runner-fixture"}),
            {"name": "rating", "value": "good", "data_type": "CATEGORICAL", "config_id": "rating-config"},
            {"name": "untyped", "value": "fallback", "data_type": None, "config_id": None},
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
    FLOCI_TEST_TIMEOUT_MS,
  );

  it(
    "preserves runner error classifications",
    async () => {
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
    },
    FLOCI_TEST_TIMEOUT_MS,
  );

  it.each([
    {
      label: "self-referential list",
      source: `
def evaluate(ctx):
    items = []
    items.append(items)
    return {"scores": [{"name": "x", "value": 1, "metadata": {"items": items}}]}
`,
      message: /RecursionError/,
    },
    {
      label: "tuple holding a cyclic list",
      source: `
def evaluate(ctx):
    items = []
    items.append(items)
    return {"scores": [{"name": "x", "value": 1, "metadata": {"items": (items,)}}]}
`,
      message: /Circular reference detected/,
    },
  ])(
    "returns a non-retryable INVALID_RESULT for a Python $label",
    async ({ source, message }) => {
      // Cycles must not escape the runner. An unhandled Lambda error is
      // classified as a retryable invocation failure.
      await expect(
        dispatcher.dispatch({
          ...baseInput,
          runtime: { language: "PYTHON" },
          code: { source },
        }),
      ).rejects.toMatchObject({
        code: "INVALID_RESULT",
        message: expect.stringMatching(message),
        retryable: false,
      } satisfies Partial<CodeEvalDispatcherError>);
    },
    FLOCI_TEST_TIMEOUT_MS,
  );

  it(
    "formats Python exceptions with type and evaluator line number",
    async () => {
      // Line 4 of the source raises; str(KeyError) alone would be just "'beer'".
      await expect(
        dispatcher.dispatch({
          ...baseInput,
          runtime: { language: "PYTHON" },
          code: {
            source: `
def evaluate(ctx):
    data = {"output": ctx.observation.output}
    return data["beer"]
`,
          },
        }),
      ).rejects.toMatchObject({
        code: "USER_CODE_ERROR",
        message: "KeyError: 'beer' (line 4)",
        retryable: false,
      } satisfies Partial<CodeEvalDispatcherError>);
    },
    FLOCI_TEST_TIMEOUT_MS,
  );

  it(
    "prefixes non-generic error names from the Node runner",
    async () => {
      await expect(
        dispatcher.dispatch({
          ...baseInput,
          runtime: { language: "TYPESCRIPT" },
          code: {
            source: `function evaluate(ctx: any) { return ctx.observation.missing.deeply; }`,
          },
        }),
      ).rejects.toMatchObject({
        code: "USER_CODE_ERROR",
        message: expect.stringMatching(
          /^TypeError: Cannot read properties of undefined/,
        ),
        retryable: false,
      } satisfies Partial<CodeEvalDispatcherError>);
    },
    FLOCI_TEST_TIMEOUT_MS,
  );

  it.each<CodeEvalRuntimeLanguage>(["TYPESCRIPT", "PYTHON"])(
    "reads a payload without targetType as an observation in the %s runner",
    async (language) => {
      const source: Record<CodeEvalRuntimeLanguage, string> = {
        TYPESCRIPT: `
function evaluate(ctx: any) {
  return {
    scores: [
      { name: "target", value: ctx.targetType, dataType: "CATEGORICAL" },
      { name: "output", value: ctx.observation.output, dataType: "TEXT" },
    ],
  };
}
`,
        PYTHON: `
def evaluate(ctx):
    return {
        "scores": [
            {"name": "target", "value": ctx.target_type, "dataType": "CATEGORICAL"},
            {"name": "output", "value": ctx.observation.output, "dataType": "TEXT"},
        ]
    }
`,
      };

      await expect(
        dispatcher.dispatch({
          ...baseInput,
          runtime: { language },
          code: { source: source[language] },
          // Dispatchers released before trace targets send no targetType.
          payload: {
            observation: {
              input: "hello",
              output: "hello world",
              metadata: null,
              toolCalls: [],
            },
          } as DispatchInput["payload"],
        }),
      ).resolves.toEqual({
        scores: [
          { name: "target", value: "observation", dataType: "CATEGORICAL" },
          { name: "output", value: "hello world", dataType: "TEXT" },
        ],
      });
    },
    FLOCI_TEST_TIMEOUT_MS,
  );

  const tracePayload: DispatchInput["payload"] = {
    targetType: "trace",
    trace: {
      threads: [
        {
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Weather in Zurich?" }],
            },
            {
              role: "assistant",
              parts: [
                {
                  type: "tool-call",
                  toolCallId: "call-1",
                  toolName: "get_weather",
                  input: { city: "Zurich" },
                },
              ],
            },
          ],
        },
        {
          messages: [
            {
              role: "assistant",
              parts: [
                {
                  type: "tool-call",
                  toolCallId: "call-0",
                  toolName: "search",
                  input: {},
                },
              ],
            },
          ],
        },
      ],
    },
  };

  it.each<CodeEvalRuntimeLanguage>(["TYPESCRIPT", "PYTHON"])(
    "passes trace threads to the %s runner",
    async (language) => {
      const source: Record<CodeEvalRuntimeLanguage, string> = {
        TYPESCRIPT: `
function evaluate(ctx: any) {
  const messages = ctx.trace.threads.flatMap((t: any) => t.messages);
  const calls = messages
    .flatMap((m: any) => m.parts)
    .filter((p: any) => p.type === "tool-call");
  return {
    scores: [
      { name: "target", value: ctx.targetType, dataType: "CATEGORICAL" },
      { name: "threads", value: ctx.trace.threads.length, dataType: "NUMERIC" },
      { name: "tool-calls", value: calls.length, dataType: "NUMERIC" },
      { name: "first-role", value: messages[0].role, dataType: "CATEGORICAL" },
    ],
  };
}
`,
        PYTHON: `
def evaluate(ctx):
    messages = [m for t in ctx.trace.threads for m in t["messages"]]
    calls = [p for m in messages for p in m["parts"] if p["type"] == "tool-call"]
    return {
        "scores": [
            {"name": "target", "value": ctx.target_type, "dataType": "CATEGORICAL"},
            {"name": "threads", "value": len(ctx.trace.threads), "dataType": "NUMERIC"},
            {"name": "tool-calls", "value": len(calls), "dataType": "NUMERIC"},
            {"name": "first-role", "value": messages[0]["role"], "dataType": "CATEGORICAL"},
        ]
    }
`,
      };

      await expect(
        dispatcher.dispatch({
          ...baseInput,
          runtime: { language },
          code: { source: source[language] },
          payload: tracePayload,
        }),
      ).resolves.toEqual({
        scores: [
          { name: "target", value: "trace", dataType: "CATEGORICAL" },
          { name: "threads", value: 2, dataType: "NUMERIC" },
          { name: "tool-calls", value: 2, dataType: "NUMERIC" },
          { name: "first-role", value: "user", dataType: "CATEGORICAL" },
        ],
      });
    },
    FLOCI_TEST_TIMEOUT_MS,
  );

  it.each([
    {
      language: "TYPESCRIPT" as const,
      source: `function evaluate(ctx: any) { return { scores: [{ name: "match", value: ctx.observation.output === ctx.observation.input ? 1 : 0 }] }; }`,
      message: /^TypeError: Cannot read properties of undefined/,
    },
    {
      language: "PYTHON" as const,
      source: `
def evaluate(ctx):
    return {"scores": [{"name": "match", "value": 1 if ctx.observation.output == ctx.observation.input else 0}]}
`,
      message: /^AttributeError: 'NoneType' object has no attribute/,
    },
  ])(
    "fails an observation evaluator on a trace payload in the $language runner",
    async ({ language, source, message }) => {
      await expect(
        dispatcher.dispatch({
          ...baseInput,
          runtime: { language },
          code: { source },
          payload: tracePayload,
        }),
      ).rejects.toMatchObject({
        code: "USER_CODE_ERROR",
        message: expect.stringMatching(message),
        retryable: false,
      } satisfies Partial<CodeEvalDispatcherError>);
    },
    FLOCI_TEST_TIMEOUT_MS,
  );
});
