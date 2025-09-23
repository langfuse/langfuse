import crypto from "crypto";
import { z } from "zod/v4";

/**
 * Utilities for generating idempotency keys for Stripe API operations.
 * Ensures that operations are not accidentally executed multiple times, even across different cloud regions.
 *
 * Used primarily in stripeBillingService.ts for subscription operations:
 * - Plan changes
 * - Subscription schedule management
 * - Cancellations and reactivations
 *
 * The idempotency key combines:
 * - Operation type (IdempotencyKind)
 * - Relevant fields (e.g., subscriptionId)
 * - Operation ID for uniqueness
 */

/**
 * Enumeration of all supported idempotent operations.
 * Each value represents a specific type of Stripe API operation that needs idempotency protection.
 */
export const IdempotencyKind = z.enum([
  "subscription.schedule.release",
  "subscription.update.product",
  "subscription.schedule.create.fromSub",
  "subscription.schedule.update",
  "subscription.cancelAtPeriodEnd",
  "subscription.cancel.now",
  "subscription.reactivate",
  "subscription.migrate.flexible",
  "subscription.schedule.clear",
  "subscription.update.discounts.add",
]);

export type IdempotencyKind = z.infer<typeof IdempotencyKind>;

/**
 * Creates a stable hash of an object by sorting keys before stringification.
 * Used internally by makeIdempotencyKey to ensure consistent hashing.
 *
 * @param obj - Any JSON-serializable object to hash
 * @returns A 16-character hexadecimal hash string
 */
export function stableHash(obj: unknown): string {
  try {
    const json = JSON.stringify(obj, Object.keys(obj as any).sort());
    return crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
  } catch {
    return crypto.randomBytes(8).toString("hex");
  }
}

/**
 * Generates an idempotency key for Stripe API operations.
 * The key combines operation type, relevant fields, and an operation ID to ensure uniqueness.
 *
 * Format: `${kind}:${field1}=${value1}:${field2}=${value2}:op=${opId}`
 *
 * @param parts.kind - Type of operation from IdempotencyKind
 * @param parts.fields - Key-value pairs relevant to the operation
 * @param parts.opId - Unique operation identifier
 * @returns Formatted idempotency key or undefined if opId is missing
 */
export function makeIdempotencyKey(parts: {
  kind: IdempotencyKind;
  fields: Record<string, string | number | undefined>;
  opId?: string;
}): string | undefined {
  if (!parts.opId) return undefined;
  const left = Object.entries(parts.fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(":");
  return `${parts.kind}:${left}:op=${parts.opId}`;
}
