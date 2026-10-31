import { type IncomingHttpHeaders } from "node:http";
import { type NextApiRequest } from "next";
import { type Session } from "next-auth";

import {
  CloudConfigSchema,
  InternalServerError,
  type AuditLogResourceRef,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  recordIncrement,
  stageAuditLogEvents,
  type ApiAccessScope,
  type StageAuditLogEventInput,
} from "@langfuse/shared/src/server";

import {
  isAccessAuditLogEnabled,
  type AccessAuditOrg,
} from "@/src/ee/features/access-audit-log/server/isAccessAuditLogEnabled";
import {
  getAuditRequestContext,
  toApiKeyActor,
  toUserActor,
} from "@/src/features/audit-logs/server";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server";

/** What a route returned: the resource it read, typed refs to every resource in the response, and the validated request input. */
export type AccessRead = {
  route: string;
  resourceType: string;
  resourceId?: string;
  action: string;
  resourceRefs: AuditLogResourceRef[];
  params?: unknown;
  resultCount?: number;
};

type AccessEvent = Omit<
  Extract<StageAuditLogEventInput, { kind: "access" }>,
  "kind"
>;

/** Stages the access event, failing closed: the read must not return data that was not recorded. */
async function recordAccessEvent(event: AccessEvent): Promise<void> {
  try {
    await stageAuditLogEvents([{ kind: "access", ...event }]);
  } catch (error) {
    recordIncrement("langfuse.audit_log.access_event_write_failed");
    logger.error("Failed to record access event, failing the read", {
      error,
      orgId: event.orgId,
      projectId: event.projectId,
      route: event.route,
    });
    throw new InternalServerError();
  }
}

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
 * public resources have no actor and are not recorded.
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
  // Admins and viewers of public resources read projects outside their session.
  const auditOrg = org
    ? {
        orgId: org.id,
        plan: org.plan,
        accessAuditLogEnabled: org.accessAuditLogEnabled ?? false,
      }
    : await loadAccessAuditOrg({ projects: { some: { id: projectId } } });
  if (!auditOrg || !isAccessAuditLogEnabled(auditOrg)) return;

  await recordAccessEvent({
    ...read,
    orgId: auditOrg.orgId,
    projectId,
    actor: toUserActor(user, {
      orgRole: org?.role,
      projectRole: project?.role,
    }),
    surface: "trpc",
    request: getAuditRequestContext(ctx.headers),
  });
}

/**
 * Records a public API read when its org records access events. Call it
 * before returning the data: a failed write fails the read.
 */
export async function recordPublicApiAccess(
  { scope, req }: { scope: ApiAccessScope; req: NextApiRequest },
  read: AccessRead,
): Promise<void> {
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

  await recordAccessEvent({
    ...read,
    orgId: auditOrg.orgId,
    projectId: scope.projectId ?? undefined,
    actor: toApiKeyActor(scope.apiKeyId, undefined, undefined),
    surface: "public-api",
    request: getAuditRequestContext(req.headers, req.socket.remoteAddress),
  });
}
