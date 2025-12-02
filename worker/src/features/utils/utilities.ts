import crypto from "node:crypto";
import { logger } from "@langfuse/shared/src/server";

export function compileTemplateString(
  template: string,
  context: Record<string, any>,
): string {
  try {
    return template.replace(/{{\s*([\w.]+)\s*}}/g, (match, key) => {
      if (key in context) {
        const value = context[key];
        return value === undefined || value === null ? "" : String(value);
      }
      return match; // missing key → return original variable including its braces
    });
  } catch (error) {
    logger.info("Template compilation error:", error);

    return template;
  }
}

/**
 * Creates a W3C Trace Context compliant trace ID (16 bytes as 32 hex characters).
 *
 * @param {string} [seed] - Optional seed string for deterministic trace ID generation.
 *                          If provided, generates a trace ID by hashing the seed with SHA-256.
 *                          If omitted, generates a cryptographically random trace ID.
 * @returns {string} A 32-character hexadecimal string representing a 16-byte trace ID.
 *
 * @example
 * // Generate a random trace ID
 * const traceId = createW3CTraceId();
 * // => "a3f5b2c8d9e1f4a7b6c3d2e5f8a9b4c7"
 *
 * @example
 * // Generate a deterministic trace ID from a seed
 * const traceId = createW3CTraceId("my-seed-value");
 * // => "5d41402abc4b2a76b9719d911017c592"
 */
export function createW3CTraceId(seed?: string): string {
  if (seed) {
    const data = new TextEncoder().encode(seed);
    const hash = crypto.createHash("SHA-256").update(data).digest("hex");

    return hash.slice(0, 32); // take first 32 chars (16 bytes worth)
  } else {
    return crypto.randomBytes(16).toString("hex"); // already 32 chars
  }
}
