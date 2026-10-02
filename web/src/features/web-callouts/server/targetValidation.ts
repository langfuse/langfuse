import { TRPCError } from "@trpc/server";

import { env } from "@/src/env.mjs";
import { type WebCalloutInvokeInput } from "@/src/features/web-callouts/types";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  getObservationById,
  getObservationByIdFromEventsTable,
  getTraceById,
  getTraceByIdFromEventsTable,
  getTracesIdentifierForSession,
  getTracesIdentifierForSessionFromEvents,
  logger,
} from "@langfuse/shared/src/server";

export const assertTargetBelongsToProject = async ({
  prisma,
  input,
  useEventsTable,
}: {
  prisma: PrismaClient;
  input: WebCalloutInvokeInput;
  useEventsTable: boolean;
}) => {
  if (!input.traceId && !input.sessionId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Trace or session id is required.",
    });
  }

  const trace = input.traceId
    ? await getTraceForProject({
        traceId: input.traceId,
        projectId: input.projectId,
        useEventsTable,
      })
    : null;

  if (input.traceId && !trace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Trace not found in project.",
    });
  }

  if (input.observationId) {
    if (!input.traceId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Observation callouts require a trace id.",
      });
    }

    // The observation belongs to this trace, so the trace timestamp is a tight
    // lower bound for its start_time and lets the lookup prune events_full. On a
    // genuine miss the lookup retries unbounded internally: trace.timestamp is
    // an independent SDK-supplied field that can post-date a child observation's
    // start_time, and legitimate backfills mean an observation can be older than
    // any project-derived floor, so no safe fallback bound exists.
    const observation = await getObservationForProject({
      observationId: input.observationId,
      traceId: input.traceId,
      projectId: input.projectId,
      useEventsTable,
      startTimeLowerBound: trace?.timestamp,
    });

    if (!observation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Observation not found in project.",
      });
    }
  }

  if (input.sessionId) {
    if (trace && trace.sessionId !== input.sessionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Trace does not belong to the provided session.",
      });
    }

    const sessionExists = await sessionBelongsToProject({
      prisma,
      projectId: input.projectId,
      sessionId: input.sessionId,
      useEventsTable,
    });

    if (!sessionExists) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Session not found in project.",
      });
    }
  }
};

const getTraceForProject = async ({
  traceId,
  projectId,
  useEventsTable,
}: {
  traceId: string;
  projectId: string;
  useEventsTable: boolean;
}) => {
  if (useEventsTable) {
    const trace = await tryGetTraceFromEvents({ traceId, projectId });
    if (trace) return trace;
  }

  const trace = await tryGetTrace({ traceId, projectId });
  if (trace) return trace;

  if (shouldTryEventsTableFallback(useEventsTable)) {
    return tryGetTraceFromEvents({ traceId, projectId });
  }

  return undefined;
};

// Validation only needs the observation's existence, so the lookup keeps just
// its identity — this stays assignable from both the observations- and
// events-table getters, whose full return shapes differ.
type WebCalloutObservation = { id: string };

// A single-source lookup either resolves to an observation, a genuine not-found
// (undefined observation, transientError false), or a transient failure
// (transientError true) that the helpers swallow so the caller can decide
// whether to retry.
type ObservationLookupResult = {
  observation?: WebCalloutObservation;
  transientError: boolean;
};

// The aggregate result of running the source chain at one bound. cleanMiss is
// true when at least one source returned a genuine not-found under the bound —
// the signal that an unbounded retry is worthwhile.
type ObservationChainResult = {
  observation?: WebCalloutObservation;
  cleanMiss: boolean;
};

const getObservationForProject = async ({
  observationId,
  traceId,
  projectId,
  useEventsTable,
  startTimeLowerBound,
}: {
  observationId: string;
  traceId: string;
  projectId: string;
  useEventsTable: boolean;
  startTimeLowerBound?: Date;
}) => {
  const bounded = await runObservationLookup({
    observationId,
    traceId,
    projectId,
    useEventsTable,
    startTimeLowerBound,
  });
  if (bounded.observation) return bounded.observation;

  // Retry unbounded only when at least one bounded source produced a genuine
  // clean miss: the observation could legitimately be older than the bound
  // (backfills, or trace.timestamp post-dating a child observation). If every
  // source instead transient-errored (timeout, ClickHouse unavailable) the
  // bounded pass told us nothing, so skip the second expensive unbounded scan
  // and fail fast — matching the pre-bounding behavior.
  if (startTimeLowerBound && bounded.cleanMiss) {
    const unbounded = await runObservationLookup({
      observationId,
      traceId,
      projectId,
      useEventsTable,
      startTimeLowerBound: undefined,
    });
    if (unbounded.observation) return unbounded.observation;
  }

  return undefined;
};

const runObservationLookup = async ({
  observationId,
  traceId,
  projectId,
  useEventsTable,
  startTimeLowerBound,
}: {
  observationId: string;
  traceId: string;
  projectId: string;
  useEventsTable: boolean;
  startTimeLowerBound?: Date;
}): Promise<ObservationChainResult> => {
  // Remember a genuine clean miss from any source, even if a later source in the
  // chain transient-errors: the earlier clean miss still means the observation
  // could exist outside the bound, so the unbounded retry must stay eligible.
  let cleanMiss = false;

  const consider = (result: ObservationLookupResult) => {
    if (!result.observation && !result.transientError) {
      cleanMiss = true;
    }
    return result.observation;
  };

  if (useEventsTable) {
    const observation = consider(
      await tryGetObservationFromEvents({
        observationId,
        traceId,
        projectId,
        startTimeLowerBound,
      }),
    );
    if (observation) return { observation, cleanMiss };
  }

  const observation = consider(
    await tryGetObservation({
      observationId,
      traceId,
      projectId,
      startTimeLowerBound,
    }),
  );
  if (observation) return { observation, cleanMiss };

  if (shouldTryEventsTableFallback(useEventsTable)) {
    const fallback = consider(
      await tryGetObservationFromEvents({
        observationId,
        traceId,
        projectId,
        startTimeLowerBound,
      }),
    );
    if (fallback) return { observation: fallback, cleanMiss };
  }

  return { cleanMiss };
};

const tryGetTrace = async ({
  traceId,
  projectId,
}: {
  traceId: string;
  projectId: string;
}) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Per customer requirement, web callouts should also work on v3.
    return await getTraceById({
      traceId,
      projectId,
      excludeInputOutput: true,
      excludeMetadata: true,
    });
  } catch (error) {
    logger.warn("Failed to validate web callout trace via traces table", {
      projectId,
      traceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return undefined;
  }
};

const tryGetTraceFromEvents = async ({
  traceId,
  projectId,
}: {
  traceId: string;
  projectId: string;
}) => {
  try {
    return await getTraceByIdFromEventsTable({
      traceId,
      projectId,
      renderingProps: {
        truncated: true,
        shouldJsonParse: false,
      },
    });
  } catch (error) {
    logger.warn("Failed to validate web callout trace via events table", {
      projectId,
      traceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return undefined;
  }
};

const tryGetObservation = async ({
  observationId,
  traceId,
  projectId,
  startTimeLowerBound,
}: {
  observationId: string;
  traceId: string;
  projectId: string;
  startTimeLowerBound?: Date;
}): Promise<ObservationLookupResult> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Per customer requirement, web callouts should also work on v3.
    const observation = await getObservationById({
      id: observationId,
      projectId,
      traceId,
      startTimeLowerBound,
      fetchWithInputOutput: false,
      renderingProps: {
        truncated: true,
        shouldJsonParse: false,
      },
    });
    return { observation, transientError: false };
  } catch (error) {
    if (error instanceof LangfuseNotFoundError) {
      return { transientError: false };
    }
    logger.warn(
      "Failed to validate web callout observation via observations table",
      {
        projectId,
        observationId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    );
    return { transientError: true };
  }
};

const tryGetObservationFromEvents = async ({
  observationId,
  traceId,
  projectId,
  startTimeLowerBound,
}: {
  observationId: string;
  traceId: string;
  projectId: string;
  startTimeLowerBound?: Date;
}): Promise<ObservationLookupResult> => {
  try {
    const observation = await getObservationByIdFromEventsTable({
      id: observationId,
      projectId,
      traceId,
      startTimeLowerBound,
      fetchWithInputOutput: false,
      renderingProps: {
        truncated: true,
        shouldJsonParse: false,
      },
    });
    return { observation, transientError: false };
  } catch (error) {
    if (error instanceof LangfuseNotFoundError) {
      return { transientError: false };
    }
    logger.warn("Failed to validate web callout observation via events table", {
      projectId,
      observationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { transientError: true };
  }
};

const sessionBelongsToProject = async ({
  prisma,
  projectId,
  sessionId,
  useEventsTable,
}: {
  prisma: PrismaClient;
  projectId: string;
  sessionId: string;
  useEventsTable: boolean;
}) => {
  const postgresSession = await prisma.traceSession.findFirst({
    where: {
      id: sessionId,
      projectId,
    },
    select: {
      id: true,
    },
  });

  if (postgresSession) {
    return true;
  }

  const traces = useEventsTable
    ? await tryGetTracesIdentifierForSessionFromEvents({
        projectId,
        sessionId,
      })
    : await tryGetTracesIdentifierForSession({
        projectId,
        sessionId,
      });

  if (traces.length > 0) {
    return true;
  }

  if (shouldTryEventsTableFallback(useEventsTable)) {
    const eventTraces = await tryGetTracesIdentifierForSessionFromEvents({
      projectId,
      sessionId,
    });
    return eventTraces.length > 0;
  }

  return false;
};

const tryGetTracesIdentifierForSession = async ({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Per customer requirement, web callouts should also work on v3.
    return await getTracesIdentifierForSession(projectId, sessionId);
  } catch (error) {
    logger.warn("Failed to validate web callout session via traces table", {
      projectId,
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
};

const tryGetTracesIdentifierForSessionFromEvents = async ({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) => {
  try {
    return await getTracesIdentifierForSessionFromEvents(projectId, sessionId);
  } catch (error) {
    logger.warn("Failed to validate web callout session via events table", {
      projectId,
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
};

const shouldTryEventsTableFallback = (useEventsTable: boolean) =>
  !useEventsTable &&
  (env.LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS === "true" ||
    env.LANGFUSE_ENABLE_EVENTS_TABLE_UI === "true");
