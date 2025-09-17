import crypto from "crypto";
import { z } from "zod/v4";

export const IdempotencyKind = z.enum([
  "subscription.schedule.release",
  "subscription.update.product",
  "subscription.schedule.create.fromSub",
  "subscription.schedule.update",
  "subscription.cancelAtPeriodEnd",
  "subscription.reactivate",
  "subscription.migrate.flexible",
  "subscription.schedule.clear",
]);

export type IdempotencyKind = z.infer<typeof IdempotencyKind>;

export function stableHash(obj: unknown): string {
  try {
    const json = JSON.stringify(obj, Object.keys(obj as any).sort());
    return crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
  } catch {
    return crypto.randomBytes(8).toString("hex");
  }
}

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
