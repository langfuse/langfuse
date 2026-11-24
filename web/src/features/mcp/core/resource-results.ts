import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";

/** Cache fields of every resource and skill result: never cached, per user. */
export const resourceResultCache = {
  resultType: "complete",
  ttlMs: 0,
  cacheScope: "private",
} as const;

/** The error for a resource or skill URI this server does not have. */
export const resourceNotFound = () =>
  new ProtocolError(
    ProtocolErrorCode.InvalidParams,
    "Unknown skill or resource",
  );
