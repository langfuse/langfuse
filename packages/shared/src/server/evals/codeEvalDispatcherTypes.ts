import { z } from "zod";
import { ScoreDataTypeEnum, TEXT_SCORE_MAX_LENGTH } from "../../domain/scores";

export const CODE_EVAL_SOURCE_MAX_BYTES = 256 * 1024;
export const CODE_EVAL_DISPATCH_PAYLOAD_MAX_BYTES = 5.5 * 1024 * 1024;
export const CODE_EVAL_DISPATCH_RESULT_MAX_BYTES = 256 * 1024;
// TODO: Replace with a dedicated code-based evaluator limits docs page.
export const CODE_EVAL_DOCS_URL =
  "https://langfuse.com/docs/evaluation/overview";

export function withCodeEvalDocs(message: string): string {
  const trimmedMessage = message.trim();
  const punctuatedMessage = /[.!?]$/.test(trimmedMessage)
    ? trimmedMessage
    : `${trimmedMessage}.`;

  return `${punctuatedMessage} See ${CODE_EVAL_DOCS_URL} for details.`;
}

export const CodeEvalRuntimeLanguage = z.enum(["PYTHON", "TYPESCRIPT"]);
export type CodeEvalRuntimeLanguage = z.infer<typeof CodeEvalRuntimeLanguage>;

export type CodeEvalScope = {
  organizationId: string;
  projectId: string;
  evaluatorId: string;
};

export type CodeEvalPayload = {
  observation: {
    input: unknown;
    output: unknown;
    metadata: unknown;
  };
  experiment?: {
    itemExpectedOutput: unknown;
    itemMetadata: unknown;
  };
};

export type DispatchInput = {
  scope: CodeEvalScope;
  runtime: { language: CodeEvalRuntimeLanguage };
  execution: {
    jobExecutionId: string;
  };
  code: {
    source: string;
  };
  payload: CodeEvalPayload;
};

const codeEvalScoreBase = {
  name: z.string().min(1),
  comment: z.string().nullish(),
  configId: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
};

const CodeEvalScoreSchema = z.union([
  z.object({
    ...codeEvalScoreBase,
    value: z.number(),
    dataType: z.literal(ScoreDataTypeEnum.NUMERIC),
  }),
  z.object({
    ...codeEvalScoreBase,
    value: z.string(),
    dataType: z.literal(ScoreDataTypeEnum.CATEGORICAL),
  }),
  z.object({
    ...codeEvalScoreBase,
    // BOOLEAN explicitly signals intent, so accept the values users most
    // commonly return — native booleans, 0/1, and string forms ("true"/
    // "false"/"1"/"0", case-insensitive) — and normalize to the 0/1 wire
    // encoding the score ingestion expects.
    value: z
      .union([z.literal(0), z.literal(1), z.boolean(), z.string()])
      .transform((v, ctx): 0 | 1 => {
        if (v === 0 || v === 1) return v;
        if (typeof v === "boolean") return v ? 1 : 0;

        const normalized = v.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return 1;
        if (normalized === "false" || normalized === "0") return 0;

        ctx.addIssue({
          code: "custom",
          message: `Invalid boolean value: ${JSON.stringify(v)}`,
        });
        return z.NEVER;
      }),
    dataType: z.literal(ScoreDataTypeEnum.BOOLEAN),
  }),
  z.object({
    ...codeEvalScoreBase,
    // Mirror the public ingestion `ScoreBody` cap on TEXT score length so that
    // an oversized TEXT value fails fast as a non-retryable `INVALID_RESULT`
    // at the dispatcher, instead of being silently dropped later by the
    // ingestion consumer after the `JobExecution` is already marked
    // COMPLETED.
    value: z.string().min(1).max(TEXT_SCORE_MAX_LENGTH),
    dataType: z.literal(ScoreDataTypeEnum.TEXT),
  }),
  z.object({
    ...codeEvalScoreBase,
    value: z.union([z.string(), z.number()]),
    dataType: z.undefined().optional(),
  }),
]);

const CodeEvalDispatchResultSchema = z.object({
  scores: z.array(CodeEvalScoreSchema).min(1),
});

export type CodeEvalScore = z.infer<typeof CodeEvalScoreSchema>;
export type CodeEvalScoreWithName = CodeEvalScore;
export type DispatchResult = z.infer<typeof CodeEvalDispatchResultSchema>;

export interface CodeEvalDispatcher {
  name: string;
  dispatch(input: DispatchInput): Promise<DispatchResult>;
}

export const CodeEvalDispatcherErrorCode = z.enum([
  "INVALID_RESULT",
  "INVALID_SOURCE",
  "PAYLOAD_TOO_LARGE",
  "RESULT_TOO_LARGE",
  "SOURCE_TOO_LARGE",
  "TIMEOUT",
  "UNSUPPORTED_RUNTIME",
  "USER_CODE_ERROR",
  "LAMBDA_CONCURRENCY_LIMIT",
  "LAMBDA_CONFIGURATION_ERROR",
  "LAMBDA_INVOCATION_ERROR",
]);
export type CodeEvalDispatcherErrorCode = z.infer<
  typeof CodeEvalDispatcherErrorCode
>;
export const CodeEvalDispatcherErrorCodes = CodeEvalDispatcherErrorCode.enum;

export class CodeEvalDispatcherError extends Error {
  public readonly code: CodeEvalDispatcherErrorCode;
  public readonly retryable: boolean;
  public readonly returnedResult?: unknown;

  constructor(
    message: string,
    options: {
      code: CodeEvalDispatcherErrorCode;
      retryable?: boolean;
      cause?: unknown;
      returnedResult?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "CodeEvalDispatcherError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.returnedResult = options.returnedResult;
  }
}

export type CodeEvalDispatcherName = "insecure-local" | "aws-lambda";

export function assertDispatchInputWithinLimits(input: DispatchInput): string {
  const sourceBytes = Buffer.byteLength(input.code.source, "utf8");
  if (sourceBytes > CODE_EVAL_SOURCE_MAX_BYTES) {
    throw new CodeEvalDispatcherError(
      `Code eval source exceeds the ${CODE_EVAL_SOURCE_MAX_BYTES} byte limit`,
      { code: CodeEvalDispatcherErrorCodes.SOURCE_TOO_LARGE },
    );
  }

  const serializedInput = JSON.stringify(input);
  const payloadBytes = Buffer.byteLength(serializedInput, "utf8");
  if (payloadBytes > CODE_EVAL_DISPATCH_PAYLOAD_MAX_BYTES) {
    throw new CodeEvalDispatcherError(
      `Code eval dispatch payload exceeds the ${CODE_EVAL_DISPATCH_PAYLOAD_MAX_BYTES} byte limit`,
      { code: CodeEvalDispatcherErrorCodes.PAYLOAD_TOO_LARGE },
    );
  }

  return serializedInput;
}

/**
 * Guard against malicious or runaway evaluator output that would blow up
 * downstream score ingestion and ClickHouse writes. Each dispatcher is
 * expected to call this with the byte size at its cheapest representation:
 * Lambda has the raw response bytes (`response.Payload.byteLength`) so the
 * check is free; the local dispatcher must serialize the in-memory result
 * because there is no wire payload.
 */
export function assertDispatchResultWithinByteLimit(byteSize: number): void {
  if (byteSize > CODE_EVAL_DISPATCH_RESULT_MAX_BYTES) {
    throw new CodeEvalDispatcherError(
      `Code eval result exceeds the ${CODE_EVAL_DISPATCH_RESULT_MAX_BYTES} byte limit`,
      { code: CodeEvalDispatcherErrorCodes.RESULT_TOO_LARGE },
    );
  }
}

export function parseDispatchResult(result: unknown): DispatchResult {
  const parsed = CodeEvalDispatchResultSchema.safeParse(result);

  if (!parsed.success) {
    throw new CodeEvalDispatcherError(
      `Invalid code eval result: ${parsed.error.message}`,
      {
        code: CodeEvalDispatcherErrorCodes.INVALID_RESULT,
        returnedResult: result,
      },
    );
  }

  return parsed.data;
}
