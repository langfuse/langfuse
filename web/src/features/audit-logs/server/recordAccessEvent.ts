import { type IncomingHttpHeaders } from "node:http";
import { type NextApiRequest } from "next";
import { type Session } from "next-auth";

import {
  CloudConfigSchema,
  type AuditLogResourceRef,
  type AuditRequestContext,
} from "@langfuse/shared";
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
import { type ServerContext } from "@/src/features/mcp/types";

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
 * Records a read by a signed-in user when the org that owns the project
 * records access events. Anonymous viewers of public resources have no actor
 * and are not recorded. The event is staged by the recorder, which runs
 * only for orgs that pass the gate.
 */
async function recordUserAccess(
  user: Session["user"] | undefined,
  projectId: string,
  read: AccessRead,
  via: {
    surface: "trpc" | "internal-api";
    headers: IncomingHttpHeaders;
    remoteAddress?: string;
  },
): Promise<void> {
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
    surface: via.surface,
    request: getAuditRequestContext(via.headers, via.remoteAddress),
  });
}

/** The API key a public API or MCP read is made with, and its org's opt-in. */
type ApiKeyReader = Pick<
  ApiAccessScope,
  "orgId" | "apiKeyId" | "plan" | "accessAuditLogEnabled" | "isInAppAgentKey"
> & { projectId: string | undefined };

/**
 * The key as actor. An in-app agent key acts for the user who started the run,
 * and is deleted when the run ends, so the event names that user.
 */
async function toApiKeyReaderActor(reader: ApiKeyReader) {
  if (reader.isInAppAgentKey !== true) {
    return toApiKeyActor(reader.apiKeyId, undefined, undefined);
  }
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: reader.apiKeyId },
    select: {
      createdByUserId: true,
      createdByUser: { select: { name: true, email: true } },
    },
  });
  const userId = apiKey?.createdByUserId ?? undefined;
  return toApiKeyActor(
    reader.apiKeyId,
    userId,
    userId ? apiKey?.createdByUser : undefined,
  );
}

async function recordApiKeyAccess(
  reader: ApiKeyReader,
  surface: "public-api" | "mcp",
  request: () => AuditRequestContext | undefined,
  read: AccessRead | (() => AccessRead),
): Promise<void> {
  if (!canRecordAccessEvents()) return;
  // Credentials without an org, such as the admin key, carry no opt-in.
  const auditOrg =
    reader.accessAuditLogEnabled === null
      ? await loadAccessAuditOrg({ id: reader.orgId })
      : {
          orgId: reader.orgId,
          plan: reader.plan,
          accessAuditLogEnabled: reader.accessAuditLogEnabled,
        };
  if (!auditOrg || !isAccessAuditLogEnabled(auditOrg)) return;

  await stageAccessEvent({
    ...(typeof read === "function" ? read() : read),
    orgId: auditOrg.orgId,
    projectId: reader.projectId,
    actor: await toApiKeyReaderActor(reader),
    surface,
    request: request(),
  });
}

/**
 * Records a tRPC read when its org records access events.
 */
export async function recordTrpcAccess(
  ctx: {
    session: { user?: Session["user"] } | null;
    headers: IncomingHttpHeaders;
  },
  projectId: string,
  read: AccessRead,
): Promise<void> {
  await recordUserAccess(ctx.session?.user, projectId, read, {
    surface: "trpc",
    headers: ctx.headers,
  });
}

/**
 * Records a read through a session-authenticated web route outside tRPC, such
 * as a download, when its org records access events.
 */
export async function recordInternalApiAccess(
  { session, req }: { session: Session | null; req: NextApiRequest },
  projectId: string,
  read: AccessRead,
): Promise<void> {
  await recordUserAccess(session?.user, projectId, read, {
    surface: "internal-api",
    headers: req.headers,
    remoteAddress: req.socket.remoteAddress,
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
  await recordApiKeyAccess(
    { ...scope, projectId: scope.projectId ?? undefined },
    "public-api",
    () => getAuditRequestContext(req.headers, req.socket.remoteAddress),
    read,
  );
}

/**
 * Records an MCP tool read when its org records access events. Call it
 * before returning the data: a failed write fails the tool call.
 */
export async function recordMcpAccess(
  context: ServerContext,
  read: AccessRead,
): Promise<void> {
  await recordApiKeyAccess(
    // The MCP route sets `inAppAgent` exactly for in-app agent keys.
    { ...context, isInAppAgentKey: context.inAppAgent !== undefined },
    "mcp",
    () => context.auditRequest,
    read,
  );
}
