import type { Session } from "next-auth";
import type { prisma as _prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import {
  recordAccessEvent,
  type AccessEventAction,
} from "@/src/features/audit-logs/accessEvents";

type RawInput = Record<string, unknown>;

type TrpcAccessEventRoute = {
  resourceType: string;
  action: AccessEventAction;
  /** Picks the accessed entity id from the raw input. Omit for lists. */
  resourceId?: (input: RawInput) => string | undefined;
  /** Counts returned entities. Omit when the handler returns exactly one. */
  resultCount?: (output: unknown) => number;
};

const arrayLength = (key: string) => (output: unknown) => {
  const value = (output as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(value) ? value.length : 0;
};

const topLevelArrayLength = (output: unknown) =>
  Array.isArray(output) ? output.length : 0;

const stringField = (key: string) => (input: RawInput) =>
  typeof input[key] === "string" ? (input[key] as string) : undefined;

/**
 * tRPC procedures whose successful completion is recorded as an access event.
 * Procedures not listed here are never logged. Keys are full tRPC paths.
 */
const TRPC_ACCESS_EVENT_ROUTES: Readonly<Record<string, TrpcAccessEventRoute>> =
  {
    "traces.byId": {
      resourceType: "trace",
      action: "read",
      resourceId: stringField("traceId"),
    },
    "traces.byIdWithObservationsAndScores": {
      resourceType: "trace",
      action: "read",
      resourceId: stringField("traceId"),
    },
    "events.byTraceId": {
      resourceType: "trace",
      action: "read",
      resourceId: stringField("traceId"),
    },
    "traces.all": {
      resourceType: "trace",
      action: "list",
      resultCount: arrayLength("traces"),
    },
    "observations.byId": {
      resourceType: "observation",
      action: "read",
      resourceId: stringField("observationId"),
    },
    "generations.all": {
      resourceType: "observation",
      action: "list",
      resultCount: arrayLength("generations"),
    },
    "events.all": {
      resourceType: "observation",
      action: "list",
      resultCount: arrayLength("observations"),
    },
    "sessions.byIdWithScores": {
      resourceType: "session",
      action: "read",
      resourceId: stringField("sessionId"),
    },
    "sessions.byIdWithScoresFromEvents": {
      resourceType: "session",
      action: "read",
      resourceId: stringField("sessionId"),
    },
    "sessions.all": {
      resourceType: "session",
      action: "list",
      resultCount: arrayLength("sessions"),
    },
    "sessions.allFromEvents": {
      resourceType: "session",
      action: "list",
      resultCount: arrayLength("sessions"),
    },
    "batchExport.create": {
      resourceType: "batchExport",
      action: "export",
      resultCount: () => 0,
    },
    "batchExport.downloadUrl": {
      resourceType: "batchExport",
      action: "download",
      resourceId: stringField("batchExportId"),
    },
    "media.getById": {
      resourceType: "media",
      action: "download",
      resourceId: stringField("mediaId"),
    },
    "media.getByTraceOrObservationId": {
      resourceType: "media",
      action: "download",
      resultCount: topLevelArrayLength,
    },
  };

/**
 * The session as it looks after any of the protected middlewares. Project
 * procedures add org and project ids and roles; trace and session getters add
 * only the project role and may serve anonymous viewers of public traces.
 */
type ProtectedSession = Session & {
  orgId?: string;
  orgRole?: string;
  projectId?: string;
  projectRole?: string;
};

async function resolveOrg(
  session: ProtectedSession,
  projectId: string,
  prisma: typeof _prisma,
): Promise<{ orgId: string; orgRole?: string } | null> {
  if (session.orgId) {
    return { orgId: session.orgId, orgRole: session.orgRole };
  }
  const membership = session.user?.organizations.find((org) =>
    org.projects.some((project) => project.id === projectId),
  );
  if (membership) {
    return { orgId: membership.id, orgRole: membership.role };
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { orgId: true },
  });
  return project ? { orgId: project.orgId } : null;
}

/**
 * Records one access event for a successfully completed allowlisted tRPC
 * procedure. Anonymous viewers of public traces and sessions are not recorded:
 * there is no actor to attribute the access to.
 */
export async function recordTrpcAccessEvent(args: {
  path: string;
  /** `ctx.session` as left by the authorisation middleware of the procedure. */
  session: unknown;
  prisma: typeof _prisma;
  rawInput: unknown;
  output: unknown;
}): Promise<void> {
  const route = TRPC_ACCESS_EVENT_ROUTES[args.path];
  if (!route) return;

  const session =
    typeof args.session === "object" && args.session !== null
      ? (args.session as ProtectedSession)
      : null;
  const userId = session?.user?.id;
  if (!session || !userId) return;

  const input =
    typeof args.rawInput === "object" && args.rawInput !== null
      ? (args.rawInput as RawInput)
      : {};
  const projectId =
    session.projectId ??
    (typeof input.projectId === "string" ? input.projectId : undefined);
  if (!projectId) return;

  const org = await resolveOrg(session, projectId, args.prisma);
  if (!org) {
    logger.warn("Skipping access event, project has no organisation", {
      path: args.path,
      projectId,
    });
    return;
  }

  await recordAccessEvent({
    actor: {
      type: "USER",
      userId,
      orgRole: org.orgRole,
      projectRole: session.projectRole,
    },
    orgId: org.orgId,
    projectId,
    surface: "trpc",
    route: args.path,
    resourceType: route.resourceType,
    resourceId: route.resourceId?.(input),
    action: route.action,
    params: input,
    resultCount: route.resultCount ? route.resultCount(args.output) : 1,
  });
}
