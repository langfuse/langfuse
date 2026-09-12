import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Cross-runtime execution receipt for optional independent verification.
 *
 * Context: https://github.com/langfuse/langfuse/issues/17377
 *
 * Langfuse already captures agent/tool traces. This module provides a tiny,
 * opt-in helper that exports one real tool execution as a compact,
 * provider-neutral JSON receipt containing:
 *
 * - the real tool call (`tool`, `args`)
 * - the observed result (`observedResult`)
 * - runtime/provider identity (`executor`)
 * - provenance links (Langfuse trace/observation URL, capture timestamp)
 * - SHA-256 hashes sufficient for independent recomputation
 *
 * No secrets, API keys, or proprietary trace exports are included. The caller
 * owns redaction: only pass values that are safe to publish.
 *
 * The native receipt (`langfuse.execution-receipt.v1`) can be converted to a
 * `sable.submission.v0.9` envelope for external verification without
 * re-collecting evidence. A PASS only means the published evidence is
 * internally consistent and independently recomputable; it does not imply the
 * agent is generally reliable or production-safe.
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

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }
  return value;
}

/**
 * Canonical JSON: sorted keys, compact separators, UTF-8. Matches
 * `json.dumps(..., sort_keys=True, separators=(",", ":"), ensure_ascii=False)`.
 */
export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(sortJsonValue(value)) ?? "null";
}

export function sha256HexOfCanonical(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJsonString(value), "utf8")
    .digest("hex");
}

export const executionReceiptToolCallSchema = z.object({
  tool: z.string().min(1),
  args: z.unknown(),
  observedResult: z.unknown(),
  observationId: z.string().min(1).optional(),
  stateBeforeHash: hex64.optional(),
  stateAfterHash: hex64.optional(),
});

export const executionReceiptExecutorSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).optional(),
  framework: z.string().min(1).optional(),
  frameworkVersion: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  revision: z.string().min(1).optional(),
});

export const executionReceiptInputSchema = z.object({
  executionId: z.string().min(1),
  traceId: z.string().min(1),
  projectId: z.string().min(1),
  goal: z.string().min(1).optional(),
  claimedStatus: z.enum(["success", "failure", "uncertain"]).default("success"),
  finalReport: z.string().optional(),
  environment: z.unknown().optional(),
  executor: executionReceiptExecutorSchema,
  toolCalls: z.array(executionReceiptToolCallSchema).min(1),
  langfuseTraceUrl: z.string().url().optional(),
  capturedAt: z.string().min(1).optional(),
});

export type ExecutionReceiptInput = z.infer<typeof executionReceiptInputSchema>;
export type ExecutionReceiptToolCall = z.infer<
  typeof executionReceiptToolCallSchema
>;

export const executionReceiptSchema = z.object({
  protocolVersion: z.literal(EXECUTION_RECEIPT_PROTOCOL_VERSION),
  executionId: z.string().min(1),
  traceId: z.string().min(1),
  projectId: z.string().min(1),
  goal: z.string().optional(),
  claimedStatus: z.enum(["success", "failure", "uncertain"]),
  finalReport: z.string().optional(),
  environment: z.unknown().optional(),
  executor: executionReceiptExecutorSchema,
  toolCalls: z
    .array(
      executionReceiptToolCallSchema.extend({
        argsHash: hex64,
        observedResultHash: hex64,
      }),
    )
    .min(1),
  provenance: z.object({
    capturedAt: z.string().min(1),
    collector: z.string().min(1),
    langfuseTraceUrl: z.string().url().optional(),
    redactionPolicy: z.string().min(1),
  }),
  commitmentId: z.string().min(1),
  commitmentHash: hex64,
  receiptHash: hex64,
  contentAddress: z.string().min(1),
  hashAlgorithm: z.literal(EXECUTION_RECEIPT_HASH_ALGORITHM),
  canonicalization: z.literal(EXECUTION_RECEIPT_CANONICALIZATION),
});

export type ExecutionReceipt = z.infer<typeof executionReceiptSchema>;

function toIsoTimestamp(value?: string): string {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
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

export const sableSubmissionSchema = z.object({
  protocol_version: z.literal(SABLE_SUBMISSION_PROTOCOL_VERSION),
  submission_id: z.string().min(1),
  source: z.object({
    agent_name: z.string().min(1),
    agent_version: z.string().min(1),
    framework: z.string().min(1),
    framework_version: z.string().min(1),
    adapter: z.string().min(1),
  }),
  trace: z.object({
    task_id: z.string(),
    goal: z.string(),
    agent: z.unknown(),
    steps: z.array(
      z.object({
        tool: z.string(),
        args: z.unknown(),
        observed_result: z.unknown(),
        before_state_hash: hex64,
        after_state_hash: hex64,
        state_after: z.unknown(),
      }),
    ),
    claimed_status: z.enum(["success", "failure", "uncertain"]),
    final_report: z.string(),
    environment: z.unknown(),
    integrity: z.object({
      state_hash_algorithm: z.literal("sha256"),
    }),
  }),
  provenance: z.object({
    captured_at: z.string().min(1),
    collector: z.string().min(1),
    redaction_policy: z.string().min(1),
  }),
  integrity: z.object({
    source_trace_hash: hex64,
    hash_algorithm: z.literal("sha256"),
    canonicalization: z.literal("json-sort-keys-utf8"),
  }),
});

export type SableSubmission = z.infer<typeof sableSubmissionSchema>;

/**
 * Map a Langfuse execution receipt to a `sable.submission.v0.9` envelope so
 * the same real execution can be checked by an external verifier without
 * re-collecting evidence.
 */
export function toSableSubmission(receipt: ExecutionReceipt): SableSubmission {
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
