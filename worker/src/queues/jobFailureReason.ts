import { isS3SlowDownError } from "@langfuse/shared/src/server";

const MAX_CAUSE_DEPTH = 8;

export type JobFailureReason =
  | "s3_slowdown"
  | "payload_too_large"
  | "invalid_data"
  | "network"
  | "stalled"
  | "other";

/**
 * Low-cardinality failure category for queue metrics. Storage helpers wrap the
 * original error as `cause`, so the whole cause chain is inspected.
 */
export function classifyJobFailure(err: unknown): JobFailureReason {
  if (isS3SlowDownError(err)) return "s3_slowdown";

  const chain = causeChain(err);
  if (chain.some(isPayloadTooLarge)) return "payload_too_large";
  if (chain.some(isInvalidData)) return "invalid_data";
  if (chain.some(isNetworkError)) return "network";
  if (chain.some((e) => messageOf(e).includes("stalled more than allowable")))
    return "stalled";
  return "other";
}

/** Breadth-first over `cause` and `AggregateError.errors`. */
function causeChain(err: unknown): object[] {
  const chain: object[] = [];
  const pending: unknown[] = [err];
  while (pending.length > 0 && chain.length < MAX_CAUSE_DEPTH) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || chain.includes(current)) {
      continue;
    }
    chain.push(current);
    pending.push((current as { cause?: unknown }).cause);
    const nested = (current as { errors?: unknown }).errors;
    if (Array.isArray(nested)) pending.push(...nested);
  }
  return chain;
}

function messageOf(err: object): string {
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" ? message.toLowerCase() : "";
}

function codeOf(err: object): unknown {
  return (err as { code?: unknown }).code;
}

function isPayloadTooLarge(err: object): boolean {
  const message = messageOf(err);
  return (
    codeOf(err) === "ERR_STRING_TOO_LONG" ||
    message.includes("invalid string length") ||
    message.includes("cannot create a string longer than") ||
    (message.includes("size of json object") &&
      message.includes("extremely large"))
  );
}

function isInvalidData(err: object): boolean {
  const name = (err as { name?: unknown }).name;
  const message = messageOf(err);
  return (
    name === "SyntaxError" ||
    name === "ZodError" ||
    message.includes("invalid byte sequence") ||
    message.includes("cannot parse input")
  );
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
]);

function isNetworkError(err: object): boolean {
  const name = (err as { name?: unknown }).name;
  const message = messageOf(err);
  return (
    NETWORK_ERROR_CODES.has(codeOf(err) as string) ||
    name === "TimeoutError" ||
    message.includes("socket hang up")
  );
}
