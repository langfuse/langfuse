import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Opt-in verifiable execution receipt for one real Langfuse-traced tool execution.
 *
 * Langfuse already captures agent/tool traces. This module exports one real
 * tool execution as a compact, provider-neutral JSON receipt containing the
 * real tool call (`tool`/`args`), the observed result, runtime identity
 * (`executor`), provenance (capture timestamp, Langfuse trace URL,
 * caller-controlled redaction policy), and SHA-256 hashes sufficient for
 * independent recomputation.
 *
 * No secrets, API keys, or full trace exports are included. The caller owns
 * redaction: only pass values that are safe to publish.
 *
 * A PASS only means the published evidence is internally consistent and
 * independently recomputable — not that the agent is generally reliable.
 *
 * Canonicalization (`json-sort-keys-utf8`):
 * - Object keys are sorted lexicographically (UTF-16 code-unit order, matching
 *   Python `sort_keys=True` for ASCII keys), arrays preserve order, output is
 *   compact (`separators=(",", ":")`) and hashed as UTF-8 bytes.
 * - Only JSON-native values are accepted (string, finite number, boolean,
 *   null, array, object). `bigint`, `undefined`, functions, and symbols are
 *   rejected. `Date` instances are normalized to ISO-8601 strings before
 *   hashing so the hash matches the exported JSON.
 * - Numbers are finite only (`NaN`/`Infinity` are rejected — Python emits
 *   `Infinity`, which is invalid JSON). Integer-valued numbers within
 *   `Number.MAX_SAFE_INTEGER` serialize as plain integers. Non-integers use
 *   Python-compatible float formatting: exponential notation for
 *   `abs(n) < 1e-4` (e.g. `1e-05` instead of JS `0.00001`) with the exponent
 *   padded to at least two digits (`1e-07`, not `1e-7`), so a Python verifier
 *   using `json.dumps(sort_keys=True, separators=(",", ":"),
 *   ensure_ascii=False)` recomputes identical hashes. `-0` is normalized to
 *   `0`. Values beyond `MAX_SAFE_INTEGER` must be passed as strings.
 *
 * Reference Python verifier:
 * ```python
 * import hashlib, json
 * canonical = json.dumps(receipt_body, sort_keys=True, separators=(",", ":"),
 *                        ensure_ascii=False)
 * assert hashlib.sha256(canonical.encode("utf-8")).hexdigest() == receipt_hash
 * ```
 */

export const EXECUTION_RECEIPT_PROTOCOL_VERSION =
  "langfuse.execution-receipt.v1" as const;
export const SABLE_SUBMISSION_PROTOCOL_VERSION =
  "sable.submission.v0.9" as const;
export const EXECUTION_RECEIPT_HASH_ALGORITHM = "sha256" as const;
export const EXECUTION_RECEIPT_CANONICALIZATION =
  "json-sort-keys-utf8" as const;
export const EXECUTION_RECEIPT_COLLECTOR =
  "langfuse-execution-receipt/0.1" as const;

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

/** JSON-native value. Rejects `bigint`, `undefined`, functions, symbols. */
export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().refine((n) => Number.isFinite(n), {
      message: "Number must be finite (NaN/Infinity not allowed)",
    }),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/**
 * Format a finite number the way Python's `json.dumps` does, so hashes
 * recomputed in Python match byte-for-byte.
 */
function formatCanonicalNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Non-finite numbers cannot be canonically hashed");
  }
  // Normalize -0 to 0: JSON round-trips "-0.0" (Python) vs "0" (JS) otherwise.
  if (Object.is(value, -0)) {
    return "0";
  }
  if (Number.isInteger(value)) {
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        "Integer exceeds Number.MAX_SAFE_INTEGER; pass it as a string",
      );
    }
    return String(value);
  }
  const abs = Math.abs(value);
  // Python uses exponential notation for abs < 1e-4 (e.g. 1e-05, not 0.00001).
  // All doubles >= 2**52 are integers, so no large-magnitude branch is needed.
  if (abs !== 0 && abs < 1e-4) {
    const exp = value.toExponential();
    const match = exp.match(/^(-?\d(?:\.\d+)?)[eE]([+-]?\d+)$/);
    if (!match) {
      throw new Error(`Cannot canonicalize number: ${String(value)}`);
    }
    const [, mantissa, expDigits] = match;
    const sign = expDigits.startsWith("-") ? "-" : "+";
    const digits = expDigits.replace(/^[+-]/, "").padStart(2, "0");
    return `${mantissa}e${sign}${digits}`;
  }
  // Normalize JS exponentials that do occur (e.g. 1e+21) to Python padding.
  const raw = String(value);
  const expMatch = raw.match(/^(-?\d(?:\.\d+)?)[eE]([+-]?\d+)$/);
  if (expMatch) {
    const [, mantissa, expDigits] = expMatch;
    const sign = expDigits.startsWith("-") ? "-" : "+";
    const digits = expDigits.replace(/^[+-]/, "").padStart(2, "0");
    return `${mantissa}e${sign}${digits}`;
  }
  return raw;
}

function stringifyCanonical(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value) ?? "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return formatCanonicalNumber(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stringifyCanonical(entry)).join(",")}]`;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Invalid Date cannot be canonically hashed");
    }
    return JSON.stringify(value.toISOString()) ?? "null";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(
        ([key, nested]) =>
          `${JSON.stringify(key)}:${stringifyCanonical(nested)}`,
      )
      .join(",")}}`;
  }
  throw new Error(
    `Unsupported value for canonical JSON: ${typeof value} (only JSON-native values, no bigint/undefined/function/symbol)`,
  );
}

/**
 * Canonical JSON: sorted keys, compact separators, UTF-8.
 * Byte-compatible with Python
 * `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`
 * for all accepted (finite, JSON-native) values.
 */
export function canonicalJsonString(value: unknown): string {
  return stringifyCanonical(value);
}

export function sha256HexOfCanonical(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJsonString(value), "utf8")
    .digest("hex");
}

export const executionReceiptToolCallSchema = z
  .object({
    tool: z.string().min(1),
    args: jsonValueSchema,
    observedResult: jsonValueSchema,
    observationId: z.string().min(1).optional(),
    stateBeforeHash: hex64.optional(),
    stateAfterHash: hex64.optional(),
  })
  .strict();

export const executionReceiptExecutorSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1).optional(),
    framework: z.string().min(1).optional(),
    frameworkVersion: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    revision: z.string().min(1).optional(),
  })
  .strict();

export const executionReceiptInputSchema = z
  .object({
    executionId: z.string().min(1),
    traceId: z.string().min(1),
    projectId: z.string().min(1),
    goal: z.string().min(1).optional(),
    claimedStatus: z
      .enum(["success", "failure", "uncertain"])
      .default("success"),
    finalReport: z.string().optional(),
    environment: jsonValueSchema.optional(),
    executor: executionReceiptExecutorSchema,
    toolCalls: z.array(executionReceiptToolCallSchema).min(1),
    langfuseTraceUrl: z.url().optional(),
    capturedAt: z.string().min(1).optional(),
  })
  .strict();

export type ExecutionReceiptInput = z.infer<typeof executionReceiptInputSchema>;
export type ExecutionReceiptToolCall = z.infer<
  typeof executionReceiptToolCallSchema
>;

export const executionReceiptSchema = z
  .object({
    protocolVersion: z.literal(EXECUTION_RECEIPT_PROTOCOL_VERSION),
    executionId: z.string().min(1),
    traceId: z.string().min(1),
    projectId: z.string().min(1),
    goal: z.string().optional(),
    claimedStatus: z.enum(["success", "failure", "uncertain"]),
    finalReport: z.string().optional(),
    environment: jsonValueSchema.optional(),
    executor: executionReceiptExecutorSchema,
    toolCalls: z
      .array(
        executionReceiptToolCallSchema.extend({
          argsHash: hex64,
          observedResultHash: hex64,
        }),
      )
      .min(1),
    provenance: z
      .object({
        capturedAt: z.string().min(1),
        collector: z.string().min(1),
        langfuseTraceUrl: z.url().optional(),
        redactionPolicy: z.string().min(1),
      })
      .strict(),
    commitmentId: z.string().min(1),
    commitmentHash: hex64,
    receiptHash: hex64,
    contentAddress: z.string().min(1),
    hashAlgorithm: z.literal(EXECUTION_RECEIPT_HASH_ALGORITHM),
    canonicalization: z.literal(EXECUTION_RECEIPT_CANONICALIZATION),
  })
  .strict();

export type ExecutionReceipt = z.infer<typeof executionReceiptSchema>;

/**
 * Resolve the capture timestamp. Only an omitted `capturedAt` defaults to
 * now; a supplied but unparsable value is rejected so typos cannot silently
 * become false provenance.
 */
function toIsoTimestamp(value?: string): string {
  if (value === undefined) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid capturedAt timestamp: ${JSON.stringify(value)} (expected ISO-8601 or omitted)`,
    );
  }
  return parsed.toISOString();
}

/**
 * Build a verifiable execution receipt from one real Langfuse-traced tool
 * execution. Pass only publishable values (no secrets or API keys).
 */
export function buildExecutionReceipt(
  rawInput: ExecutionReceiptInput,
): ExecutionReceipt {
  const input = executionReceiptInputSchema.parse(rawInput);
  const capturedAt = toIsoTimestamp(input.capturedAt);

  const toolCalls = input.toolCalls.map((call) => ({
    ...call,
    argsHash: sha256HexOfCanonical(call.args ?? null),
    observedResultHash: sha256HexOfCanonical(call.observedResult ?? null),
  }));

  const commitmentPayload = {
    executionId: input.executionId,
    traceId: input.traceId,
    projectId: input.projectId,
    executor: input.executor,
    toolCalls: toolCalls.map((call) => ({
      tool: call.tool,
      argsHash: call.argsHash,
      observedResultHash: call.observedResultHash,
      stateBeforeHash: call.stateBeforeHash ?? null,
      stateAfterHash: call.stateAfterHash ?? null,
    })),
  };
  const commitmentHash = sha256HexOfCanonical(commitmentPayload);
  const commitmentId = `commitment:${commitmentHash.slice(0, 16)}`;

  const body = {
    protocolVersion: EXECUTION_RECEIPT_PROTOCOL_VERSION,
    executionId: input.executionId,
    traceId: input.traceId,
    projectId: input.projectId,
    ...(input.goal !== undefined ? { goal: input.goal } : {}),
    claimedStatus: input.claimedStatus,
    ...(input.finalReport !== undefined
      ? { finalReport: input.finalReport }
      : {}),
    ...(input.environment !== undefined
      ? { environment: input.environment }
      : {}),
    executor: input.executor,
    toolCalls,
    provenance: {
      capturedAt,
      collector: EXECUTION_RECEIPT_COLLECTOR,
      ...(input.langfuseTraceUrl !== undefined
        ? { langfuseTraceUrl: input.langfuseTraceUrl }
        : {}),
      redactionPolicy: "caller-controlled; no secrets; public receipt only",
    },
    commitmentId,
    commitmentHash,
    hashAlgorithm: EXECUTION_RECEIPT_HASH_ALGORITHM,
    canonicalization: EXECUTION_RECEIPT_CANONICALIZATION,
  };

  const receiptHash = sha256HexOfCanonical(body);

  return executionReceiptSchema.parse({
    ...body,
    receiptHash,
    contentAddress: `sha256:${receiptHash}`,
  });
}

export type ReceiptVerification = {
  ok: boolean;
  reasons: string[];
};

/**
 * Independently verify a receipt by recomputing every hash. Returns
 * `{ ok: true }` only when the evidence is internally consistent.
 * Schemas are strict: unknown properties fail verification instead of being
 * silently stripped.
 */
export function verifyExecutionReceipt(
  receipt: ExecutionReceipt,
): ReceiptVerification {
  const reasons: string[] = [];
  const parsed = executionReceiptSchema.safeParse(receipt);

  if (!parsed.success) {
    return { ok: false, reasons: ["schema_mismatch"] };
  }

  const value = parsed.data;

  for (const call of value.toolCalls) {
    if (sha256HexOfCanonical(call.args ?? null) !== call.argsHash) {
      reasons.push(`args_hash_mismatch:${call.tool}`);
    }
    if (
      sha256HexOfCanonical(call.observedResult ?? null) !==
      call.observedResultHash
    ) {
      reasons.push(`observed_result_hash_mismatch:${call.tool}`);
    }
  }

  const commitmentPayload = {
    executionId: value.executionId,
    traceId: value.traceId,
    projectId: value.projectId,
    executor: value.executor,
    toolCalls: value.toolCalls.map((call) => ({
      tool: call.tool,
      argsHash: call.argsHash,
      observedResultHash: call.observedResultHash,
      stateBeforeHash: call.stateBeforeHash ?? null,
      stateAfterHash: call.stateAfterHash ?? null,
    })),
  };

  if (sha256HexOfCanonical(commitmentPayload) !== value.commitmentHash) {
    reasons.push("commitment_hash_mismatch");
  }

  if (
    value.commitmentId !== `commitment:${value.commitmentHash.slice(0, 16)}`
  ) {
    reasons.push("commitment_id_mismatch");
  }

  const { receiptHash, contentAddress, ...body } = value;
  if (sha256HexOfCanonical(body) !== receiptHash) {
    reasons.push("receipt_hash_mismatch");
  }
  if (contentAddress !== `sha256:${receiptHash}`) {
    reasons.push("content_address_mismatch");
  }

  return { ok: reasons.length === 0, reasons };
}

export const sableSubmissionSchema = z
  .object({
    protocol_version: z.literal(SABLE_SUBMISSION_PROTOCOL_VERSION),
    submission_id: z.string().min(1),
    source: z
      .object({
        agent_name: z.string().min(1),
        agent_version: z.string().min(1),
        framework: z.string().min(1),
        framework_version: z.string().min(1),
        adapter: z.string().min(1),
      })
      .strict(),
    trace: z
      .object({
        task_id: z.string(),
        goal: z.string(),
        agent: jsonValueSchema,
        steps: z.array(
          z
            .object({
              tool: z.string(),
              args: jsonValueSchema,
              observed_result: jsonValueSchema,
              before_state_hash: hex64,
              after_state_hash: hex64,
              state_after: jsonValueSchema,
            })
            .strict(),
        ),
        claimed_status: z.enum(["success", "failure", "uncertain"]),
        final_report: z.string(),
        environment: jsonValueSchema,
        integrity: z
          .object({
            state_hash_algorithm: z.literal("sha256"),
          })
          .strict(),
      })
      .strict(),
    provenance: z
      .object({
        captured_at: z.string().min(1),
        collector: z.string().min(1),
        redaction_policy: z.string().min(1),
      })
      .strict(),
    integrity: z
      .object({
        source_trace_hash: hex64,
        hash_algorithm: z.literal("sha256"),
        canonicalization: z.literal("json-sort-keys-utf8"),
      })
      .strict(),
  })
  .strict();

export type SableSubmission = z.infer<typeof sableSubmissionSchema>;

/**
 * Map a Langfuse execution receipt to a `sable.submission.v0.9` envelope so
 * the same real execution can be checked by an external verifier without
 * re-collecting evidence. The receipt is re-verified first so tampered
 * evidence (stale hashes) cannot be laundered into a valid envelope.
 */
export function toSableSubmission(receipt: ExecutionReceipt): SableSubmission {
  const verification = verifyExecutionReceipt(receipt);
  if (!verification.ok) {
    throw new Error(
      `Cannot convert invalid execution receipt: ${verification.reasons.join(", ")}`,
    );
  }
  const value = executionReceiptSchema.parse(receipt);

  const trace = {
    task_id: value.traceId,
    goal: value.goal ?? value.executionId,
    agent: {
      name: value.executor.name,
      version: value.executor.version ?? "unknown",
    },
    steps: value.toolCalls.map((call) => ({
      tool: call.tool,
      args: call.args,
      observed_result: call.observedResult,
      before_state_hash:
        call.stateBeforeHash ??
        sha256HexOfCanonical({ traceId: value.traceId, kind: "before" }),
      after_state_hash:
        call.stateAfterHash ??
        sha256HexOfCanonical(call.observedResult ?? null),
      state_after: call.observedResult,
    })),
    claimed_status: value.claimedStatus,
    final_report: value.finalReport ?? "",
    environment: value.environment ?? {},
    integrity: { state_hash_algorithm: "sha256" as const },
  };

  return sableSubmissionSchema.parse({
    protocol_version: SABLE_SUBMISSION_PROTOCOL_VERSION,
    submission_id: value.executionId,
    source: {
      agent_name: value.executor.name,
      agent_version: value.executor.version ?? "unknown",
      framework: value.executor.framework ?? "langfuse",
      framework_version: value.executor.frameworkVersion ?? "unknown",
      adapter: EXECUTION_RECEIPT_COLLECTOR,
    },
    trace,
    provenance: {
      captured_at: value.provenance.capturedAt,
      collector: value.provenance.collector,
      redaction_policy: value.provenance.redactionPolicy,
    },
    integrity: {
      source_trace_hash: sha256HexOfCanonical(trace),
      hash_algorithm: "sha256" as const,
      canonicalization: "json-sort-keys-utf8" as const,
    },
  });
}

/**
 * Verify a SABLE envelope structurally by recomputing its trace hash.
 * This checks internal consistency, not general agent reliability.
 */
export function verifySableSubmission(
  submission: SableSubmission,
): ReceiptVerification {
  const parsed = sableSubmissionSchema.safeParse(submission);
  if (!parsed.success) {
    return { ok: false, reasons: ["schema_mismatch"] };
  }

  const value = parsed.data;
  if (sha256HexOfCanonical(value.trace) !== value.integrity.source_trace_hash) {
    return { ok: false, reasons: ["source_trace_hash_mismatch"] };
  }

  return { ok: true, reasons: [] };
}
