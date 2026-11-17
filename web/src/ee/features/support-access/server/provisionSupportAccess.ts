import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

import {
  type GrantRequest,
  type RevokeRequest,
  type SupportAccessRequest,
} from "./conductorOnePayload";
import {
  grantSupportAccess,
  parseSupportAccess,
  revokeAllSupportAccess,
} from "./supportAccess";

const SUPPORT_EMAIL_DOMAIN = "clickhouse.com";
const MAX_GRANT_MS = 12 * 60 * 60 * 1000;

export type ProvisionResult = { ok: boolean; message: string };

function accepted(message: string): ProvisionResult {
  return { ok: true, message };
}

function rejected(message: string): ProvisionResult {
  return { ok: false, message };
}

async function findUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, supportAccess: true },
  });
  if (!user) return null;
  return { id: user.id, supportAccess: parseSupportAccess(user.supportAccess) };
}

type User = NonNullable<Awaited<ReturnType<typeof findUser>>>;

async function resolveOrgId(orgOrProjectId: string): Promise<string | null> {
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id: orgOrProjectId }, { orgId: orgOrProjectId }],
    },
    select: { orgId: true },
  });
  return project?.orgId ?? null;
}

async function grant(
  request: GrantRequest,
  user: User | null,
  now: Date,
): Promise<ProvisionResult> {
  if (!request.durationMs || request.durationMs > MAX_GRANT_MS) {
    return rejected("Access must be time-bound to at most 12 hours.");
  }
  if (!request.email.endsWith(`@${SUPPORT_EMAIL_DOMAIN}`)) {
    return rejected(
      `Requester email is not allowed. Only @${SUPPORT_EMAIL_DOMAIN} accounts can request support access; request again with your @${SUPPORT_EMAIL_DOMAIN} identity.`,
    );
  }
  if (!user) {
    return rejected(
      `No Clickhouse account found for the requester in this region. Sign up with Google first using your @${SUPPORT_EMAIL_DOMAIN} account, then submit a new request.`,
    );
  }

  const orgId = await resolveOrgId(request.orgOrProjectId);
  if (!orgId) {
    return rejected(
      `Organization or project ${request.orgOrProjectId} not found in this region.`,
    );
  }

  const expiresAt = new Date(now.getTime() + request.durationMs);
  await grantSupportAccess(user.id, orgId, expiresAt);
  logger.info("ConductorOne support access granted", {
    userId: user.id,
    orgId,
    expiresAt: expiresAt.toISOString(),
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
  logger.info("ConductorOne support access revoked", {
    userId: user.id,
    orgIds,
    c1TaskId: request.taskId,
  });
  return accepted("Support access revoked");
}

export async function provisionSupportAccess(
  request: SupportAccessRequest,
  entitlementId: string,
  now: Date = new Date(),
): Promise<ProvisionResult> {
  if (request.entitlementId !== entitlementId) {
    return rejected(`This entitlement is not handled by this region`);
  }

  const user = await findUser(request.email);
  if (request.action === "grant") {
    return grant(request, user, now);
  }
  return revoke(request, user);
}
