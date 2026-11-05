import { type IncomingHttpHeaders } from "node:http";
import { type NextApiRequest } from "next";
import { type Session } from "next-auth";

import { CloudConfigSchema, type AuditLogResourceRef } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { type ApiAccessScope } from "@langfuse/shared/src/server";

import { stageAccessEvent } from "@/src/ee/features/access-audit-log/server/stageAccessEvent";
import {
  canRecordAccessEvents,
  isAccessAuditLogEnabled,
  type AccessAuditOrg,
} from "@/src/features/audit-logs/isAccessAuditLogEnabled";
import { getAuditRequestContext } from "@/src/features/audit-logs/server/getAuditRequestContext";
import { toApiKeyActor, toUserActor } from "@/src/features/audit-logs/auditLog";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";

/** What a route returned: the resource it read, typed refs to every resource in the response, and the validated request input. */
export type AccessRead = {
  route: string;
  resourceType: string;
  resourceId?: string;
  action: string;
  resourceRefs: AuditLogResourceRef[];
  params?: unknown;
  resultCount?: number;
  /** Set when the read was refused; the resource was not returned. */
  outcome?: "denied";
  outcomeReason?: string;
};

/** Loads the gate's org facts for a read whose credential does not carry them. */
async function loadAccessAuditOrg(
  where: { id: string } | { projects: { some: { id: string } } },
): Promise<AccessAuditOrg | null> {
  const org = await prisma.organization.findFirst({
    where,
    select: { id: true, cloudConfig: true, accessAuditLogEnabled: true },
  });
  if (!org) return null;
  const cloudConfig = CloudConfigSchema.safeParse(org.cloudConfig);
  return {
    orgId: org.id,
    plan: getOrganizationPlanServerSide(cloudConfig.data),
    accessAuditLogEnabled: org.accessAuditLogEnabled,
  };
}

/**
 * Records a tRPC read when its org records access events. Call it before
 * returning the data: a failed write fails the read. Anonymous viewers of
 * public resources have no actor and are not recorded. The event is staged by
 * the EE recorder, which runs only for orgs that pass the gate.
 */
export async function recordTrpcAccess(
  ctx: {
    session: { user?: Session["user"] } | null;
    headers: IncomingHttpHeaders;
  },
  projectId: string,
  read: AccessRead,
): Promise<void> {
  const user = ctx.session?.user;
  if (!user) return;

  const org = user.organizations.find((o) =>
    o.projects.some((p) => p.id === projectId),
  );
  const project = org?.projects.find((p) => p.id === projectId);
  const supportAccess = org?.supportAccess === true;
  if (!canRecordAccessEvents({ supportAccess })) return;
  // Admins and viewers of public resources read projects outside their session.
  const auditOrg = org
    ? {
        orgId: org.id,
        plan: org.plan,
        accessAuditLogEnabled: org.accessAuditLogEnabled ?? false,
      }
    : await loadAccessAuditOrg({ projects: { some: { id: projectId } } });
  if (!auditOrg || !isAccessAuditLogEnabled(auditOrg, { supportAccess })) {
    return;
  }

  await stageAccessEvent({
    ...read,
    orgId: auditOrg.orgId,
    projectId,
    actor: toUserActor(user, {
      orgRole: org?.role,
      projectRole: project?.role,
      supportAccess,
    }),
    surface: "trpc",
    request: getAuditRequestContext(ctx.headers),
  });
}

/**
 * Records a public API read when its org records access events. Call it
 * before returning the data: a failed write fails the read. Pass the read as a
 * function to collect its refs only for orgs that record access events.
 */
export async function recordPublicApiAccess(
  { scope, req }: { scope: ApiAccessScope; req: NextApiRequest },
  read: AccessRead | (() => AccessRead),
): Promise<void> {
  if (!canRecordAccessEvents()) return;
  // Credentials without an org, such as the admin key, carry no opt-in.
  const auditOrg =
    scope.accessAuditLogEnabled === null
      ? await loadAccessAuditOrg({ id: scope.orgId })
      : {
          orgId: scope.orgId,
          plan: scope.plan,
          accessAuditLogEnabled: scope.accessAuditLogEnabled,
        };
  if (!auditOrg || !isAccessAuditLogEnabled(auditOrg)) return;

  await stageAccessEvent({
    ...(typeof read === "function" ? read() : read),
    orgId: auditOrg.orgId,
    projectId: scope.projectId ?? undefined,
    actor: toApiKeyActor(scope.apiKeyId, undefined, undefined),
    surface: "public-api",
    request: getAuditRequestContext(req.headers, req.socket.remoteAddress),
  });
}
