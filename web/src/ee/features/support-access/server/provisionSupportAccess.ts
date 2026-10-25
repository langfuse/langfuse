import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

import { type SupportAccessRequest } from "./conductorOnePayload";

const SUPPORT_EMAIL_DOMAIN = "clickhouse.com";
const MAX_GRANT_MS = 12 * 60 * 60 * 1000;

export type ProvisionResult = { ok: boolean; message: string };

export async function provisionSupportAccess(
  request: SupportAccessRequest,
  entitlementId: string,
  now: Date = new Date(),
): Promise<ProvisionResult> {
  if (request.entitlementId !== entitlementId) {
    return { ok: false, message: "Entitlement is not handled by this region" };
  }

  const user = await prisma.user.findUnique({
    where: { email: request.email },
    select: { id: true },
  });

  if (request.action === "revoke") {
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { supportAccessExpiresAt: null },
      });
    }
    logger.info("Support access revoked", { email: request.email });
    return { ok: true, message: "Support access revoked" };
  }

  if (!request.durationMs || request.durationMs > MAX_GRANT_MS) {
    return { ok: false, message: "Grant must be time-bound to at most 12h" };
  }
  if (!request.email.endsWith(`@${SUPPORT_EMAIL_DOMAIN}`)) {
    return { ok: false, message: "Requester email domain is not allowed" };
  }
  if (!user) {
    return {
      ok: false,
      message: "Sign in to this Langfuse region once, then retry",
    };
  }

  const expiresAt = new Date(now.getTime() + request.durationMs);
  await prisma.user.update({
    where: { id: user.id },
    data: { supportAccessExpiresAt: expiresAt },
  });
  logger.info("Support access granted", {
    email: request.email,
    expiresAt: expiresAt.toISOString(),
  });
  return {
    ok: true,
    message: `VIEWER access granted until ${expiresAt.toISOString()}`,
  };
}
