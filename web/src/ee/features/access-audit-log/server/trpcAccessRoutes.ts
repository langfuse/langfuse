import { type IncomingHttpHeaders } from "node:http";
import { type TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { type Session } from "next-auth";
import * as z from "zod";

import {
  toAuditLogResourceRef,
  type AuditLogResourceRef,
  type AuditLogResourceRefType,
} from "@langfuse/shared";

import { recordTrpcAccess } from "@/src/ee/features/access-audit-log/server/recordAccessEvent";
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

// A refused call's input was never validated, so only ids that are strings
// are taken from it.
const optionalId = z.string().min(1).optional().catch(undefined);
const RequestedIdsSchema = z
  .object({
    traceId: optionalId,
    observationId: optionalId,
    sessionId: optionalId,
    scoreId: optionalId,
  })
  .catch({});

const requestedResources = (
  input: unknown,
): Partial<Record<AuditLogResourceRefType, string>> => {
  const ids = RequestedIdsSchema.parse(input);
  return {
    trace: ids.traceId,
    observation: ids.observationId,
    session: ids.sessionId,
    score: ids.scoreId,
  };
};

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

  await recordTrpcAccess(ctx, project.data.projectId, () => {
    if (result.ok) {
      return {
        route: path,
        resourceType: route.resourceType,
        resourceId: route.resourceId?.(input),
        action: route.action,
        resourceRefs: route.resourceRefs(input, result.data),
        params: input,
        resultCount: route.resultCount?.(result.data),
      };
    }
    const requested = requestedResources(input);
    return {
      route: path,
      resourceType: route.resourceType,
      resourceId:
        route.action === "read" && route.resourceType !== "experiment"
          ? requested[route.resourceType]
          : undefined,
      action: route.action,
      resourceRefs: Object.entries(requested).flatMap(([type, id]) =>
        refsIf(type as AuditLogResourceRefType, id),
      ),
      params: input,
      outcome: "denied",
      outcomeReason: result.code,
    };
  });
}
