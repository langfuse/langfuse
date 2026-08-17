/**
 * Diagnostics for Redis connection errors.
 *
 * ioredis reports a failed cluster slot-map refresh as
 * `ClusterAllFailedError: Failed to refresh slots cache.` — one identical
 * message for every underlying cause. The cause lives on `lastNodeError`, the
 * error returned by the final node ioredis tried, and is dropped by the
 * default error serialisation. These helpers lift it out and label the failure
 * mode so a timeout, a refused connection and a CLUSTERDOWN reply read as three
 * different incidents.
 */

/** Cause of a Redis connection failure, as far as the error object reveals it. */
export type RedisFailureMode =
  | "timeout"
  | "connection-refused"
  | "connection-reset"
  | "connection-closed"
  | "host-unreachable"
  | "dns"
  | "tls"
  | "auth"
  | "cluster-down"
  | "readonly"
  | "unknown";

type RedisErrorDetails = {
  name?: string;
  message?: string;
  code?: string;
  errno?: number;
  syscall?: string;
  address?: string;
  port?: number;
};

export type RedisErrorContext = {
  failureMode: RedisFailureMode;
  /**
   * Deliberately top-level, not nested under `error`: the text log format in
   * `../logger.ts` only renders `info.stack`, and the JSON format already
   * exposed a top-level `stack` before this context existed.
   */
  stack?: string;
  error: RedisErrorDetails;
  /** Present only on `ClusterAllFailedError`; `node` comes from the `node error` event. */
  lastNodeError?: RedisErrorDetails & { node?: string };
};

const readString = (source: object, key: string): string | undefined => {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
};

const readNumber = (source: object, key: string): number | undefined => {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
};

const describeError = (error: unknown): RedisErrorDetails => {
  if (typeof error !== "object" || error === null) {
    return { message: String(error) };
  }

  return {
    name: error instanceof Error ? error.name : readString(error, "name"),
    message:
      error instanceof Error ? error.message : readString(error, "message"),
    // Node attaches these to socket-level failures (ECONNREFUSED, ETIMEDOUT, …).
    code: readString(error, "code"),
    errno: readNumber(error, "errno"),
    syscall: readString(error, "syscall"),
    address: readString(error, "address"),
    port: readNumber(error, "port"),
  };
};

/** The node-level error ioredis wrapped, if this is a `ClusterAllFailedError`. */
export const getLastNodeError = (error: unknown): unknown => {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as { lastNodeError?: unknown }).lastNodeError ?? undefined;
};

const CODE_FAILURE_MODES: Record<string, RedisFailureMode> = {
  ECONNREFUSED: "connection-refused",
  ECONNRESET: "connection-reset",
  EPIPE: "connection-reset",
  ETIMEDOUT: "timeout",
  ESOCKETTIMEDOUT: "timeout",
  EHOSTUNREACH: "host-unreachable",
  ENETUNREACH: "host-unreachable",
  ENOTFOUND: "dns",
  EAI_AGAIN: "dns",
  CERT_HAS_EXPIRED: "tls",
  DEPTH_ZERO_SELF_SIGNED_CERT: "tls",
  SELF_SIGNED_CERT_IN_CHAIN: "tls",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "tls",
  ERR_TLS_CERT_ALTNAME_INVALID: "tls",
};

export const classifyRedisFailure = (error: unknown): RedisFailureMode => {
  const { code, message } = describeError(error);

  if (code) {
    const byCode =
      CODE_FAILURE_MODES[code] ?? (code.startsWith("ERR_TLS_") ? "tls" : null);
    if (byCode) return byCode;
  }

  if (!message) return "unknown";

  // Redis replies carry their condition as an uppercase prefix on the message.
  if (message.includes("CLUSTERDOWN")) return "cluster-down";
  if (message.includes("READONLY")) return "readonly";
  if (
    message.includes("NOAUTH") ||
    message.includes("WRONGPASS") ||
    message.includes("NOPERM") ||
    message.includes("invalid password") ||
    message.includes("without any password configured")
  ) {
    return "auth";
  }

  const lowerCaseMessage = message.toLowerCase();
  // ioredis times out `CLUSTER SLOTS` with a bare `new Error("timeout")`.
  if (
    lowerCaseMessage.includes("timeout") ||
    lowerCaseMessage.includes("timed out")
  ) {
    return "timeout";
  }
  if (
    lowerCaseMessage.includes("certificate") ||
    lowerCaseMessage.includes("ssl") ||
    lowerCaseMessage.includes("tls")
  ) {
    return "tls";
  }
  if (
    lowerCaseMessage.includes("connection is closed") ||
    lowerCaseMessage.includes("connection is already closed") ||
    lowerCaseMessage.includes("stream isn't writeable") ||
    lowerCaseMessage.includes("is disconnected") ||
    lowerCaseMessage.includes("is disconnecting")
  ) {
    return "connection-closed";
  }

  return "unknown";
};

/**
 * Builds the structured log payload for a Redis error.
 *
 * `nodeAddress` is the `host:port` ioredis reported alongside the matching
 * `node error` event; pass it only when it belongs to this `lastNodeError`.
 */
export const buildRedisErrorContext = (
  error: unknown,
  nodeAddress?: string,
): RedisErrorContext => {
  const lastNodeError = getLastNodeError(error);

  return {
    // Classify the node-level cause when we have one: the wrapper message is
    // the same string for every failure.
    failureMode: classifyRedisFailure(lastNodeError ?? error),
    stack: error instanceof Error ? error.stack : undefined,
    error: describeError(error),
    ...(lastNodeError !== undefined
      ? {
          // No stack: it always points into ioredis internals, and these lines
          // arrive in the thousands during a slot-refresh burst.
          lastNodeError: {
            ...describeError(lastNodeError),
            ...(nodeAddress ? { node: nodeAddress } : {}),
          },
        }
      : {}),
  };
};

/** Single-line summary so text-format logs stay diagnosable too. */
export const formatRedisErrorMessage = (
  prefix: string,
  context: RedisErrorContext,
): string => {
  const cause = context.lastNodeError;
  const causeSuffix = cause
    ? ` (last node error: ${cause.message ?? cause.name ?? "unknown"}${
        cause.code ? ` [${cause.code}]` : ""
      }${cause.node ? ` from ${cause.node}` : ""})`
    : "";

  return `${prefix} [${context.failureMode}]: ${context.error.message ?? "unknown error"}${causeSuffix}`;
};
