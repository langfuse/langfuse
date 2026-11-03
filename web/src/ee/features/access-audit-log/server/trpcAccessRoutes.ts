import { type IncomingHttpHeaders } from "node:http";
import { type AnyProcedure, type TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { type Session } from "next-auth";
import * as z from "zod";

import {
  toAuditLogResourceRef,
  type AuditLogResourceRef,
  type AuditLogResourceRefType,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

import {
  recordTrpcAccess,
  type AccessRead,
} from "@/src/ee/features/access-audit-log/server/recordAccessEvent";
import { type RouterInput, type RouterOutput } from "@/src/utils/types";

/**
 * How a tRPC read is recorded. `input` is the request input, which passed
 * validation; `output` is what the procedure returned.
 */
type AccessRoute<I, O> = {
  resourceType: AuditLogResourceRefType | "experiment";
  /** `read` returns resources the request names, `list` the rows a filter matches. */
  action: "read" | "list";
  /** The resource a `read` opened, when it names exactly one. */
  resourceId?(input: I): string | undefined;
  /** Typed refs to every resource in the response. */
  resourceRefs(input: I, output: O): AuditLogResourceRef[];
  resultCount?(output: O): number;
};

type AccessRoutes = {
  [R in keyof RouterOutput]?: {
    [P in keyof RouterOutput[R]]?: AccessRoute<
      RouterInput[R][P],
      RouterOutput[R][P]
    >;
  };
};

const ref = toAuditLogResourceRef;

const refsIf = (
  type: AuditLogResourceRefType,
  id: string | null | undefined,
): AuditLogResourceRef[] => (id ? [ref(type, id)] : []);

/** Observations with their trace and, where the row carries it, their session. */
const observationRefs = (
  rows: {
    id: string;
    traceId?: string | null;
    sessionId?: string | null;
  }[],
): AuditLogResourceRef[] =>
  rows.flatMap((row) => [
    ref("observation", row.id),
    ...refsIf("trace", row.traceId),
    ...refsIf("session", row.sessionId),
  ]);

/** Scores with the trace, observation and session they are attached to. */
const scoreRefs = (
  rows: {
    id: string;
    traceId?: string | null;
    observationId?: string | null;
    sessionId?: string | null;
  }[],
): AuditLogResourceRef[] =>
  rows.flatMap((row) => [
    ref("score", row.id),
    ...refsIf("trace", row.traceId),
    ...refsIf("observation", row.observationId),
    ...refsIf("session", row.sessionId),
  ]);

/**
 * The tRPC reads of trace, observation, session and score data that are
 * recorded as access events. A procedure that is not listed is not recorded.
 *
 * `read` routes return the content of resources the request names; `list`
 * routes return the rows that match a filter. Covers v4 `events_only`:
 * procedures that read the legacy traces and observations tables there are
 * not listed, nor are aggregate-only ones (counts, filter options, charts).
 */
const ACCESS_ROUTES: AccessRoutes = {
  events: {
    all: {
      resourceType: "observation",
      action: "list",
      resourceRefs: (_input, output) => observationRefs(output.observations),
      resultCount: (output) => output.observations.length,
    },
    listCursor: {
      resourceType: "observation",
      action: "list",
      resourceRefs: (_input, output) => observationRefs(output.observations),
      resultCount: (output) => output.observations.length,
    },
    sessionAll: {
      resourceType: "observation",
      action: "list",
      resourceRefs: (input, output) => [
        ref("session", input.sessionId),
        ...observationRefs(output.observations),
      ],
      resultCount: (output) => output.observations.length,
    },
    byTraceId: {
      resourceType: "trace",
      action: "read",
      resourceId: (input) => input.traceId,
      resourceRefs: (input, output) => [
        ref("trace", input.traceId),
        ...observationRefs(output.observations),
      ],
      resultCount: (output) => output.observations.length,
    },
    transcriptByTraceId: {
      resourceType: "trace",
      action: "read",
      resourceId: (input) => input.traceId,
      resourceRefs: (input, output) => [
        ref("trace", input.traceId),
        ...(output.transcript?.threads ?? []).flatMap((thread) =>
          thread.currentTurn.messages.flatMap((message) =>
            refsIf("observation", message.observationId),
          ),
        ),
      ],
    },
    getAgentGraphData: {
      resourceType: "trace",
      action: "read",
      resourceId: (input) => input.traceId,
      resourceRefs: (input, output) => [
        ref("trace", input.traceId),
        ...output.map((node) => ref("observation", node.id)),
      ],
      resultCount: (output) => output.length,
    },
    batchIO: {
      resourceType: "observation",
      action: "read",
      resourceRefs: (_input, output) => observationRefs(output),
      resultCount: (output) => output.length,
    },
    sessionBatchIO: {
      resourceType: "observation",
      action: "read",
      resourceRefs: (input, output) => [
        ref("session", input.sessionId),
        ...observationRefs(output),
      ],
      resultCount: (output) => output.length,
    },
    experimentBatchIO: {
      resourceType: "observation",
      action: "read",
      resourceRefs: (_input, output) => observationRefs(output),
      resultCount: (output) => output.length,
    },
    scoresForTrace: {
      resourceType: "score",
      action: "list",
      resourceRefs: (input, output) => [
        ref("trace", input.traceId),
        ...scoreRefs(output),
      ],
      resultCount: (output) => output.length,
    },
  },
  traces: {
    byId: {
      resourceType: "trace",
      action: "read",
      resourceId: (input) => input.traceId,
      resourceRefs: (input, output) => [
        ref("trace", input.traceId),
        ...refsIf("session", output?.sessionId),
      ],
    },
    byIdWithObservationsAndScores: {
      resourceType: "trace",
      action: "read",
      resourceId: (input) => input.traceId,
      resourceRefs: (input, output) => [
        ref("trace", input.traceId),
        ...refsIf("session", output.sessionId),
        ...observationRefs(output.observations),
        ...scoreRefs([...output.scores, ...output.corrections]),
      ],
      resultCount: (output) => output.observations.length,
    },
  },
  observations: {
    byId: {
      resourceType: "observation",
      action: "read",
      resourceId: (input) => input.observationId,
      resourceRefs: (input) => [
        ref("observation", input.observationId),
        ref("trace", input.traceId),
      ],
    },
  },
  sessions: {
    allFromEvents: {
      resourceType: "session",
      action: "list",
      resourceRefs: (_input, output) =>
        output.sessions.map((session) => ref("session", session.id)),
      resultCount: (output) => output.sessions.length,
    },
    metricsFromEvents: {
      resourceType: "session",
      action: "list",
      resourceRefs: (_input, output) =>
        output.map((session) => ref("session", session.id)),
      resultCount: (output) => output.length,
    },
    byIdWithScores: {
      resourceType: "session",
      action: "read",
      resourceId: (input) => input.sessionId,
      resourceRefs: (input, output) => [
        ref("session", input.sessionId),
        ...output.traces.flatMap((trace) => [
          ref("trace", trace.id),
          ...scoreRefs(trace.scores),
        ]),
        ...scoreRefs(output.scores),
      ],
      resultCount: (output) => output.traces.length,
    },
    byIdWithScoresFromEvents: {
      resourceType: "session",
      action: "read",
      resourceId: (input) => input.sessionId,
      resourceRefs: (input, output) => [
        ref("session", input.sessionId),
        ...scoreRefs(output.scores),
      ],
    },
    previewTree: {
      resourceType: "trace",
      action: "list",
      resourceRefs: (input, output) => [
        ref("session", input.sessionId),
        ...output.flatMap((trace) => [
          ref("trace", trace.id),
          ...trace.observations.map((observation) =>
            ref("observation", observation.id),
          ),
        ]),
      ],
      resultCount: (output) => output.length,
    },
    tracesFromEvents: {
      resourceType: "trace",
      action: "list",
      resourceRefs: (input, output) => [
        ref("session", input.sessionId),
        ...output.flatMap((trace) => [
          ref("trace", trace.id),
          ...scoreRefs(trace.scores),
        ]),
      ],
      resultCount: (output) => output.length,
    },
    observationsForTraceFromEvents: {
      resourceType: "trace",
      action: "read",
      resourceId: (input) => input.traceId,
      resourceRefs: (input, output) => [
        ref("session", input.sessionId),
        ref("trace", input.traceId),
        ...observationRefs(output),
      ],
      resultCount: (output) => output.length,
    },
    observationFullIOFromEvents: {
      resourceType: "observation",
      action: "read",
      resourceId: (input) => input.observationId,
      resourceRefs: (input) => [
        ref("observation", input.observationId),
        ref("trace", input.traceId),
        ref("session", input.sessionId),
      ],
    },
  },
  scores: {
    byId: {
      resourceType: "score",
      action: "read",
      resourceId: (input) => input.scoreId,
      resourceRefs: (_input, output) => scoreRefs(output ? [output] : []),
    },
    getScoreMetadataById: {
      resourceType: "score",
      action: "read",
      resourceId: (input) => input.id,
      resourceRefs: (input) => [ref("score", input.id)],
    },
    all: {
      resourceType: "score",
      action: "list",
      resourceRefs: (_input, output) => scoreRefs(output.scores),
      resultCount: (output) => output.scores.length,
    },
    allFromEvents: {
      resourceType: "score",
      action: "list",
      resourceRefs: (_input, output) => scoreRefs(output.scores),
      resultCount: (output) => output.scores.length,
    },
    metricsFromEvents: {
      resourceType: "trace",
      action: "list",
      resourceRefs: (_input, output) =>
        output.map((row) => ref("trace", row.traceId)),
      resultCount: (output) => output.length,
    },
  },
  experiments: {
    byId: {
      resourceType: "experiment",
      action: "read",
      resourceId: (input) => input.experimentId,
      resourceRefs: () => [],
    },
    items: {
      resourceType: "experiment",
      action: "list",
      resourceRefs: (_input, output) =>
        output.data.flatMap((item) =>
          item.experiments.flatMap((run) => [
            ref("observation", run.observationId),
            ref("trace", run.traceId),
          ]),
        ),
      resultCount: (output) => output.data.length,
    },
    batchIO: {
      resourceType: "experiment",
      action: "read",
      resourceRefs: () => [],
      resultCount: (output) => output.length,
    },
  },
};

const DENIED_CODES = new Set<TRPC_ERROR_CODE_KEY>([
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

const ProjectInputSchema = z.object({ projectId: z.string().min(1) });

// Longer ids are rejected at ingestion, so they cannot name a resource.
const MAX_ID_LENGTH = 800;
// The largest legitimate batch read is one table page.
const MAX_REQUESTED_OBSERVATIONS = 50;

// A refused call's input was never validated: only ids that are strings of a
// possible length are taken from it.
const requestedId = z.string().min(1).max(MAX_ID_LENGTH);
const optionalId = requestedId.optional().catch(undefined);
const RequestedIdsSchema = z
  .object({
    traceId: optionalId,
    observationId: optionalId,
    sessionId: optionalId,
    scoreId: optionalId,
    observations: z
      .array(z.object({ id: optionalId, traceId: optionalId }).catch({}))
      .optional()
      .catch(undefined),
  })
  .catch({});

const callSafely = <T>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

/** A refused read: the ids it asked for, without its unvalidated params. */
const deniedRead = (
  path: string,
  route: AccessRoute<unknown, unknown>,
  input: unknown,
  code: TRPC_ERROR_CODE_KEY,
): AccessRead => {
  const ids = RequestedIdsSchema.parse(input);
  const resourceId = requestedId.safeParse(
    callSafely(() => route.resourceId?.(input)),
  ).data;
  return {
    route: path,
    resourceType: route.resourceType,
    resourceId,
    action: route.action,
    resourceRefs: [
      ...(route.resourceType === "experiment"
        ? []
        : refsIf(route.resourceType, resourceId)),
      ...refsIf("trace", ids.traceId),
      ...refsIf("observation", ids.observationId),
      ...refsIf("session", ids.sessionId),
      ...refsIf("score", ids.scoreId),
      ...(ids.observations ?? [])
        .slice(0, MAX_REQUESTED_OBSERVATIONS)
        .flatMap((observation) => [
          ...refsIf("observation", observation.id),
          ...refsIf("trace", observation.traceId),
        ]),
    ],
    outcome: "denied",
    outcomeReason: code,
  };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The request input as the procedure's own input schema returns it, so keys
 * the schema strips never reach the audit row. Undefined when the input
 * cannot be re-validated or serialized.
 */
async function validatedParams(
  path: string,
  rawInput: unknown,
): Promise<unknown> {
  // Imported on use: the app router imports this module through trpc.ts.
  const { appRouter } = await import("@/src/server/api/root");
  // Holds every procedure by its dotted path; its type describes the nested
  // router record instead.
  const procedures = appRouter._def.procedures as unknown as Partial<
    Record<string, AnyProcedure>
  >;
  const procedure = procedures[path];
  if (!procedure) return undefined;
  try {
    let input: unknown = undefined;
    for (const parser of procedure._def.inputs) {
      const parsed: unknown = await (parser as z.ZodType).parseAsync(rawInput);
      input =
        isPlainObject(input) && isPlainObject(parsed)
          ? { ...input, ...parsed }
          : parsed;
    }
    if (input === undefined) return undefined;
    return JSON.parse(
      JSON.stringify(input, (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
  } catch {
    return undefined;
  }
}

const findAccessRoute = (
  path: string,
): AccessRoute<unknown, unknown> | undefined => {
  const [router, procedure, ...rest] = path.split(".");
  if (!router || !procedure || rest.length > 0) return undefined;
  const routes = ACCESS_ROUTES as Partial<
    Record<string, Partial<Record<string, AccessRoute<unknown, unknown>>>>
  >;
  return Object.hasOwn(routes, router)
    ? routes[router]?.[procedure]
    : undefined;
};

/**
 * Records a call to a listed tRPC read: the resources it returned, or, when
 * the caller was refused, the resources it asked for with `outcome = denied`.
 * Other failures are not recorded.
 */
export async function recordTrpcProcedureAccess({
  path,
  ctx,
  getRawInput,
  result,
}: {
  path: string;
  ctx: {
    session: { user?: Session["user"] } | null;
    headers: IncomingHttpHeaders;
  };
  getRawInput: () => Promise<unknown>;
  result:
    | { ok: true; data: unknown }
    | { ok: false; code: TRPC_ERROR_CODE_KEY };
}): Promise<void> {
  const route = findAccessRoute(path);
  if (!route || (!result.ok && !DENIED_CODES.has(result.code))) return;

  const input = await getRawInput();
  const project = ProjectInputSchema.safeParse(input);
  if (!project.success) return;

  if (result.ok) {
    await recordTrpcAccess(ctx, project.data.projectId, async () => ({
      route: path,
      resourceType: route.resourceType,
      resourceId: route.resourceId?.(input),
      action: route.action,
      resourceRefs: route.resourceRefs(input, result.data),
      params: await validatedParams(path, input),
      resultCount: route.resultCount?.(result.data),
    }));
    return;
  }

  // The caller was refused and receives no data, so a failed write keeps the
  // refusal instead of turning it into a server error.
  try {
    await recordTrpcAccess(ctx, project.data.projectId, () =>
      deniedRead(path, route, input, result.code),
    );
  } catch (error) {
    logger.warn("Failed to record a refused read", { error, route: path });
  }
}
