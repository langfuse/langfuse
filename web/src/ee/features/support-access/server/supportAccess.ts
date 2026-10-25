import { type User } from "@langfuse/shared/src/db";

type SupportAccess = Pick<User, "supportAccessExpiresAt">;

export function hasActiveSupportAccess(
  supportAccess: SupportAccess,
  now: Date = new Date(),
): boolean {
  const { supportAccessExpiresAt } = supportAccess;
  return supportAccessExpiresAt !== null && supportAccessExpiresAt > now;
}
