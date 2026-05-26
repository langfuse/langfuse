import { describe, expect, it } from "vitest";
import {
  CodeEvalDispatcherError,
  LocalCodeEvalDispatcher,
  type DispatchInput,
} from "@langfuse/shared/src/server";
import { TEXT_SCORE_MAX_LENGTH } from "../../../../../packages/shared/src/domain/scores";

const baseInput: Omit<DispatchInput, "runtime" | "code"> = {
  scope: {
    organizationId: "org-1",
    projectId: "project-1",
    evaluatorId: "evaluator-1",
  },
  execution: {
    jobExecutionId: "job-1",
  },
  payload: {
    observation: {
      input: { question: "2+2" },
      output: "4",
      metadata: { source: "test" },
    },
    experiment: {
      expectedOutput: "4",
      itemMetadata: { difficulty: "easy" },
    },
  },
};

describe("LocalCodeEvalDispatcher", () => {
  it("executes TS-lite evaluate(ctx) functions in process", async () => {
    const dispatcher = new LocalCodeEvalDispatcher();

    const result = await dispatcher.dispatch({
      ...baseInput,
      runtime: { language: "TYPESCRIPT" },
      code: {
        source: `
          type EvaluationContext = {
            observation: { output: string };
            experiment: { expectedOutput: string } | undefined;
          };
          async function evaluate(ctx: EvaluationContext) {
            return {
              scores: [{ name: "match", value: ctx.observation.output === ctx.experiment?.expectedOutput ? 1 : 0, dataType: "BOOLEAN" }],
            };
          }
        `,
      },
    });

    expect(result).toEqual({
      scores: [{ name: "match", value: 1, dataType: "BOOLEAN" }],
    });
  });

  it("rejects unsupported TypeScript syntax with a docs link", async () => {
    const dispatcher = new LocalCodeEvalDispatcher();

    const promise = dispatcher.dispatch({
      ...baseInput,
      runtime: { language: "TYPESCRIPT" },
      code: {
        source: `
            enum MatchScore {
              Mismatch = 0,
              Match = 1,
            }

            function evaluate() {
              return { scores: [{ name: "match", value: MatchScore.Match }] };
            }
          `,
      },
    });

    await expect(promise).rejects.toMatchObject({
      code: "INVALID_SOURCE",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
    await expect(promise).rejects.toThrow(
      "See https://langfuse.com/docs/evaluation/overview for details.",
    );
  });

  it("rejects sources whose module throws at top level", async () => {
    const dispatcher = new LocalCodeEvalDispatcher();

    await expect(
      dispatcher.dispatch({
        ...baseInput,
        runtime: { language: "TYPESCRIPT" },
        code: { source: `throw new Error("top-level boom");` },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SOURCE",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("rejects sources missing an evaluate function", async () => {
    const dispatcher = new LocalCodeEvalDispatcher();

    await expect(
      dispatcher.dispatch({
        ...baseInput,
        runtime: { language: "TYPESCRIPT" },
        code: { source: `const evaluate = 42;` },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SOURCE",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("surfaces evaluator runtime throws as USER_CODE_ERROR", async () => {
    const dispatcher = new LocalCodeEvalDispatcher();

    await expect(
      dispatcher.dispatch({
        ...baseInput,
        runtime: { language: "TYPESCRIPT" },
        code: {
          source: `function evaluate() { throw new Error("boom"); }`,
        },
      }),
    ).rejects.toMatchObject({
      code: "USER_CODE_ERROR",
      retryable: false,
      message: expect.stringContaining("boom"),
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("times out runaway evaluators", async () => {
    const dispatcher = new LocalCodeEvalDispatcher({ timeoutMs: 50 });

    await expect(
      dispatcher.dispatch({
        ...baseInput,
        runtime: { language: "TYPESCRIPT" },
        code: {
          source: `function evaluate() { while (true) {} }`,
        },
      }),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      retryable: true,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("times out async evaluators that never settle", async () => {
    const dispatcher = new LocalCodeEvalDispatcher({ timeoutMs: 10 });

    const result = await Promise.race([
      dispatcher
        .dispatch({
          ...baseInput,
          runtime: { language: "TYPESCRIPT" },
          code: {
            source: `
              async function evaluate() {
                await new Promise(() => {});
                return { scores: [{ name: "match", value: 1, dataType: "BOOLEAN" }] };
              }
            `,
          },
        })
        .catch((error: unknown) => error),
      new Promise((resolve) => setTimeout(() => resolve("test-timeout"), 100)),
    ]);

    expect(result).toBeInstanceOf(CodeEvalDispatcherError);
    expect(result).toMatchObject({
      code: "TIMEOUT",
      retryable: true,
    } satisfies Partial<CodeEvalDispatcherError>);
  });

  it("rejects Python evaluators", async () => {
    const dispatcher = new LocalCodeEvalDispatcher();

    await expect(
      dispatcher.dispatch({
        ...baseInput,
        runtime: { language: "PYTHON" },
        code: { source: "def evaluate(ctx): pass" },
      }),
    ).rejects.toThrow(CodeEvalDispatcherError);
  });

  it("accepts TEXT scores within the public ingestion length cap", async () => {
    const dispatcher = new LocalCodeEvalDispatcher();

    const source = `
      async function evaluate() {
        return {
          scores: [{
            value: "reasoning fits within the limit",
            dataType: "TEXT",
            name: "judge-rationale",
          }],
        };
      }
    `;

    await expect(
      dispatcher.dispatch({
        ...baseInput,
        runtime: { language: "TYPESCRIPT" },
        code: { source },
      }),
    ).resolves.toEqual({
      scores: [
        {
          value: "reasoning fits within the limit",
          dataType: "TEXT",
          name: "judge-rationale",
        },
      ],
    });
  });

  it("rejects TEXT scores that exceed the public ingestion length cap", async () => {
    const dispatcher = new LocalCodeEvalDispatcher();

    // Produce a TEXT value just over the public 500-char ingestion cap. The
    // dispatcher must surface this as a non-retryable INVALID_RESULT so the
    // job execution fails clearly instead of completing and then having the
    // score silently dropped by the ingestion consumer.
    const source = `
      async function evaluate() {
        return {
          scores: [{
            value: "a".repeat(${TEXT_SCORE_MAX_LENGTH + 1}),
            dataType: "TEXT",
            name: "judge-rationale",
          }],
        };
      }
    `;

    await expect(
      dispatcher.dispatch({
        ...baseInput,
        runtime: { language: "TYPESCRIPT" },
        code: { source },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RESULT",
      retryable: false,
    } satisfies Partial<CodeEvalDispatcherError>);
  });
});
