import crypto from "node:crypto";

/**
 * Creates a W3C Trace Context compliant trace ID (16 bytes as 32 hex characters).
 *
 * @param seed Optional seed string for deterministic trace ID generation. When
 *             provided the trace ID is SHA-256(seed) truncated to 16 bytes. When
 *             omitted a cryptographically random ID is returned.
 */
export function createW3CTraceId(seed?: string): string {
  if (!seed) {
    return crypto.randomBytes(16).toString("hex");
  }

  return crypto.createHash("SHA-256").update(seed).digest("hex").slice(0, 32);
}
