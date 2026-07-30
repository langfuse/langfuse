import { type LoggerInstance } from "next-auth";

import { logger } from "@langfuse/shared/src/server";

// NextAuth error metadata embeds caller-controlled values (e.g. the raw
// `input` of an ERR_INVALID_URL thrown for a malformed callback URL), so cap
// every serialized field to keep scanner payloads from bloating log lines.
const MAX_FIELD_LENGTH = 2_000;

const truncate = (value: string): string =>
  value.length > MAX_FIELD_LENGTH
    ? `${value.slice(0, MAX_FIELD_LENGTH)}…[truncated]`
    : value;

const serializeError = (error: Error): Record<string, unknown> => ({
  // Own enumerable props first (e.g. `code`/`input` on Node system errors) so
  // the canonical name/message/stack fields below always win on conflicts.
  ...Object.fromEntries(
    Object.entries(error as unknown as Record<string, unknown>).map(
      ([key, value]) => [key, serializeValue(value)],
    ),
  ),
  name: truncate(error.name),
  message: truncate(error.message),
  stack: error.stack ? truncate(error.stack) : undefined,
});

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) return serializeError(value);
  if (typeof value === "string") return truncate(value);
  if (value === null || typeof value !== "object") return value;
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(String(value));
  }
}

export const serializeNextAuthMetadata = (
  metadata: unknown,
): Record<string, unknown> => {
  if (metadata instanceof Error) return { error: serializeError(metadata) };
  if (metadata && typeof metadata === "object") {
    return Object.fromEntries(
      Object.entries(metadata as Record<string, unknown>).map(
        ([key, value]) => [key, serializeValue(value)],
      ),
    );
  }
  return metadata === undefined ? {} : { metadata: serializeValue(metadata) };
};

/**
 * Routes NextAuth's logging through the shared structured logger.
 *
 * Without this, next-auth writes multi-line `console.error` dumps (banner
 * line, docs URL, then a `util.inspect`ed error object) that Datadog splits
 * into many unparsed log entries with default `info` status. One structured
 * line per event keeps the error code searchable and the severity correct.
 */
export const nextAuthLogger: Partial<LoggerInstance> = {
  error: (code, metadata) => {
    logger.error(`[NEXT_AUTH] ${code}`, {
      ...serializeNextAuthMetadata(metadata),
      nextAuthErrorCode: code,
    });
  },
  warn: (code) => {
    logger.warn(`[NEXT_AUTH] ${code}`, { nextAuthWarningCode: code });
  },
  debug: (code, metadata) => {
    logger.debug(`[NEXT_AUTH] ${code}`, {
      ...serializeNextAuthMetadata(metadata),
      nextAuthDebugCode: code,
    });
  },
};
