import type { Session } from "next-auth";

import {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import type { AuthedSession } from "@/src/server/api/trpc";
import {
  requireGatewayEnabledForOrganization,
  requireGatewayGuardrailsEnabledForOrganization,
} from "./availability";
import type { GatewayUsageScope } from "./gatewayUsageScope";

export function requireGatewayAdmin(params: {
  session: Session;
  orgId: string;
}) {
  requireGatewayEnabledForOrganization(params.orgId);
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:manage",
  });
}

/** Admits organization OWNER and ADMIN when guardrails are enabled in this environment. */
export function requireGatewayGuardrailsAdmin(params: {
  session: Session;
  orgId: string;
}) {
  requireGatewayGuardrailsEnabledForOrganization(params.orgId);
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:manage",
  });
}

/** Admits organization members with gateway read access when guardrails are enabled. */
export function requireGatewayGuardrailsRead(params: {
  session: Session;
  orgId: string;
}) {
  requireGatewayGuardrailsEnabledForOrganization(params.orgId);
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:read",
  });
}

/** Admits gateway key owners. */
export function requireGatewayInvoke(params: {
  session: Session;
  orgId: string;
}) {
  requireGatewayEnabledForOrganization(params.orgId);
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:invoke",
  });
}

/** Gateway managers see the whole organization; every other key owner only their own keys and usage. */
export function getGatewayUsageScope(params: {
  session: AuthedSession;
  orgId: string;
}): GatewayUsageScope {
  const canManageGateway = hasOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:manage",
  });
  return canManageGateway
    ? { scope: "organization" }
    : { scope: "ownUsage", userId: params.session.user.id };
}
