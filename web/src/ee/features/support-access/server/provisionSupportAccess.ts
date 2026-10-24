import { auditLog } from "@/src/features/audit-logs/auditLog";
import { prisma } from "@langfuse/shared/src/db";

import {
  type GrantRequest,
  type RevokeRequest,
  type SupportAccessRequest,
} from "./conductorOnePayload";
import { grantSupportAccess, revokeAllSupportAccess } from "./supportAccess";

const SUPPORT_EMAIL_DOMAIN = "clickhouse.com";
const MAX_GRANT_MS = 12 * 60 * 60 * 1000;

export type ProvisionResult = { ok: boolean; message: string };

function accepted(message: string): ProvisionResult {
  return { ok: true, message };
}

function rejected(message: string): ProvisionResult {
  return { ok: false, message };
}

function findUser(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, supportAccess: true },
  });
}

type User = NonNullable<Awaited<ReturnType<typeof findUser>>>;

function audit(
  action: "grant" | "revoke",
  userId: string,
  orgId: string,
  after: unknown,
) {
  return auditLog({
    userId: "conductorone-webhook",
    orgId,
    resourceType: "supportAccess",
    resourceId: userId,
    action,
    after,
  });
}

async function grant(
  request: GrantRequest,
  user: User | null,
  now: Date,
): Promise<ProvisionResult> {
  if (!request.durationMs || request.durationMs > MAX_GRANT_MS) {
    return rejected("Grant must be time-bound to at most 12h");
  }
  if (!request.email.endsWith(`@${SUPPORT_EMAIL_DOMAIN}`)) {
    return rejected("Requester email domain is not allowed");
  }
  if (!user) {
    return rejected("Sign in to this Langfuse region once, then retry");
  }

  const org = await prisma.organization.findUnique({
    where: { id: request.orgId },
    select: { id: true },
  });
  if (!org) {
    return rejected("Organization not found in this region");
  }

  const expiresAt = new Date(now.getTime() + request.durationMs);
  await grantSupportAccess(user.id, org.id, expiresAt);
  await audit("grant", user.id, org.id, {
    role: "VIEWER",
    expiresAt,
    c1TaskId: request.taskId,
  });
  return accepted(`VIEWER access granted until ${expiresAt.toISOString()}`);
}

async function revoke(
  request: RevokeRequest,
  user: User | null,
): Promise<ProvisionResult> {
  if (!user) {
    return accepted("No Langfuse user, nothing to revoke");
  }

  const orgIds = await revokeAllSupportAccess(user);
  for (const orgId of orgIds) {
    await audit("revoke", user.id, orgId, { c1TaskId: request.taskId });
  }
  return accepted("Support access revoked");
}

export async function provisionSupportAccess(
  request: SupportAccessRequest,
  entitlementId: string,
  now: Date = new Date(),
): Promise<ProvisionResult> {
  if (request.entitlementId !== entitlementId) {
    return rejected("Entitlement is not handled by this Langfuse region");
  }

  const user = await findUser(request.email);
  if (request.action === "grant") {
    return grant(request, user, now);
  }
  return revoke(request, user);
}
