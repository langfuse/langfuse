import { TRPCError } from "@trpc/server";

import { env } from "@/src/env.mjs";
import { type WebCalloutInvokeInput } from "@/src/features/web-callouts/types";
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

    const observation = await getObservationForProject({
      observationId: input.observationId,
      traceId: input.traceId,
      projectId: input.projectId,
      useEventsTable,
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

const getObservationForProject = async ({
  observationId,
  traceId,
  projectId,
  useEventsTable,
}: {
  observationId: string;
  traceId: string;
  projectId: string;
  useEventsTable: boolean;
}) => {
  if (useEventsTable) {
    const observation = await tryGetObservationFromEvents({
      observationId,
      traceId,
      projectId,
    });
    if (observation) return observation;
  }

  const observation = await tryGetObservation({
    observationId,
    traceId,
    projectId,
  });
  if (observation) return observation;

  if (shouldTryEventsTableFallback(useEventsTable)) {
    return tryGetObservationFromEvents({ observationId, traceId, projectId });
  }

  return undefined;
};

const tryGetTrace = async ({
  traceId,
  projectId,
}: {
  traceId: string;
  projectId: string;
}) => {
  try {
    return await getTraceById({
      traceId,
      projectId,
      excludeInputOutput: true,
      excludeMetadata: true,
      clickhouseFeatureTag: "web-callouts",
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
      clickhouseFeatureTag: "web-callouts",
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
}: {
  observationId: string;
  traceId: string;
  projectId: string;
}) => {
  try {
    return await getObservationById({
      id: observationId,
      projectId,
      traceId,
      fetchWithInputOutput: false,
      renderingProps: {
        truncated: true,
        shouldJsonParse: false,
      },
    });
  } catch {
    return undefined;
  }
};

const tryGetObservationFromEvents = async ({
  observationId,
  traceId,
  projectId,
}: {
  observationId: string;
  traceId: string;
  projectId: string;
}) => {
  try {
    return await getObservationByIdFromEventsTable({
      id: observationId,
      projectId,
      traceId,
      fetchWithInputOutput: false,
      renderingProps: {
        truncated: true,
        shouldJsonParse: false,
      },
    });
  } catch (error) {
    logger.warn("Failed to validate web callout observation via events table", {
      projectId,
      observationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return undefined;
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
