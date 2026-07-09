import {
  BaseError,
  LangfuseNotFoundError,
  ScoreDataTypeEnum,
  UnauthorizedError,
} from "@langfuse/shared";
import {
  getScoresAndCorrectionsForTraces,
  getObservationsCountFromEventsTable,
  getObservationsForTraceFromEventsTable,
  getTraceByIdFromEventsTable,
} from "@langfuse/shared/src/server";
import { env } from "@langfuse/shared/src/env";
import { prisma } from "@langfuse/shared/src/db";
import { sendAdminAccessWebhook } from "@/src/server/adminAccessWebhook";
import { TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD } from "../shared/traceDownloadConfig";

export type TraceExportSession = {
  user: {
    email: string;
    admin?: boolean;
    organizations: Array<{
      projects: Array<{
        id: string;
      }>;
    }>;
  };
};

export type TraceExportAccessSession = TraceExportSession | null;

export class TraceDownloadTooLargeError extends BaseError {
  constructor(description = "Observations in trace are too large") {
    super("TraceDownloadTooLargeError", 422, description, true);
  }
}

const getDurationSeconds = (
  startTime: Date,
  endTime: Date | null,
): number | null => {
  if (!endTime) {
    return null;
  }

  return (endTime.getTime() - startTime.getTime()) / 1000;
};

const hasProjectAccess = (
  session: TraceExportAccessSession,
  projectId: string,
) =>
  session?.user.organizations.some((organization) =>
    organization.projects.some((project) => project.id === projectId),
  ) ?? false;

const getObservationRecordsForTrace = async (params: {
  traceId: string;
  projectId: string;
  timestamp: Date;
  omitLargeFields: boolean;
}) => {
  const { traceId, projectId, timestamp, omitLargeFields } = params;

  return getObservationsForTraceFromEventsTable({
    traceId,
    projectId,
    timestamp,
    selectIOAndMetadata: !omitLargeFields,
    selectToolData: !omitLargeFields,
  });
};

const getObservationRecordCountForTrace = async (params: {
  traceId: string;
  projectId: string;
  timestamp: Date;
}) => {
  const { traceId, projectId, timestamp } = params;

  return getObservationsCountFromEventsTable({
    projectId,
    filter: [
      { type: "string", operator: "=", column: "traceId", value: traceId },
      {
        type: "datetime",
        operator: ">=",
        column: "startTime",
        value: new Date(timestamp.getTime() - 60 * 60 * 1000),
      },
    ],
  });
};

async function getAuthorizedTrace(params: {
  traceId: string;
  projectId: string;
  session: TraceExportAccessSession;
}) {
  const { traceId, projectId, session } = params;

  const clickhouseTrace = await getTraceByIdFromEventsTable({
    traceId,
    projectId,
    renderingProps: {
      truncated: true,
      shouldJsonParse: false,
    },
  });

  if (!clickhouseTrace) {
    throw new LangfuseNotFoundError("Trace not found");
  }

  const traceSession = clickhouseTrace.sessionId
    ? await prisma.traceSession.findFirst({
        where: {
          id: clickhouseTrace.sessionId,
          projectId,
        },
        select: {
          public: true,
        },
      })
    : null;

  const isSessionPublic = traceSession?.public === true;
  const isAdmin = session?.user.admin === true;
  const canReadTrace =
    clickhouseTrace.public ||
    isSessionPublic ||
    isAdmin ||
    hasProjectAccess(session, projectId);

  if (!canReadTrace) {
    throw new UnauthorizedError(
      "User is not a member of this project and this trace is not public",
    );
  }

  if (isAdmin) {
    const dbProject = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { orgId: true },
    });

    await sendAdminAccessWebhook({
      email: session.user.email,
      projectId,
      orgId: dbProject?.orgId,
    });
  }

  return clickhouseTrace;
}

export async function buildTraceExport({
  traceId,
  projectId,
  session,
}: {
  traceId: string;
  projectId: string;
  session: TraceExportAccessSession;
}) {
  const trace = await getAuthorizedTrace({
    traceId,
    projectId,
    session,
  });

  const observationRecordCount = await getObservationRecordCountForTrace({
    traceId,
    projectId,
    timestamp: trace.timestamp,
  });
  const omitLargeFields =
    observationRecordCount >= TRACE_DOWNLOAD_OMIT_LARGE_FIELDS_THRESHOLD;
  const observationRecords = await getObservationRecordsForTrace({
    traceId,
    projectId,
    timestamp: trace.timestamp,
    omitLargeFields,
  }).then((result) => result.observations);

  if (!omitLargeFields) {
    // Same size validation as in getObservationsForTrace in observations.ts
    let payloadSize = 0;

    for (const observation of observationRecords) {
      for (const key of ["input", "output"] as const) {
        const value = observation[key];

        if (typeof value === "string") {
          payloadSize += value.length;
        }
      }

      payloadSize += JSON.stringify(observation.metadata).length;

      if (payloadSize >= env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES) {
        throw new TraceDownloadTooLargeError(
          `Observations in trace are too large: ${(payloadSize / 1e6).toFixed(2)}MB exceeds limit of ${(env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES / 1e6).toFixed(2)}MB`,
        );
      }
    }
  }

  const scoreRecords = await getScoresAndCorrectionsForTraces({
    projectId,
    traceIds: [traceId],
    timestamp: trace.timestamp,
  });

  const scores = scoreRecords.map((score) => ({
    id: score.id,
    projectId: score.projectId,
    environment: score.environment,
    name: score.name,
    source: score.source,
    authorUserId: score.authorUserId,
    comment: score.comment,
    metadata: score.metadata ?? null,
    configId: score.configId,
    createdAt: score.createdAt.toISOString(),
    updatedAt: score.updatedAt.toISOString(),
    timestamp: score.timestamp.toISOString(),
    traceId: score.traceId,
    sessionId: score.sessionId,
    datasetRunId: score.datasetRunId,
    observationId: score.observationId,
    dataType: score.dataType,
    ...(score.dataType !== ScoreDataTypeEnum.TEXT && { value: score.value }),
    ...(score.dataType === ScoreDataTypeEnum.CATEGORICAL ||
    score.dataType === ScoreDataTypeEnum.BOOLEAN ||
    score.dataType === ScoreDataTypeEnum.TEXT ||
    score.dataType === ScoreDataTypeEnum.CORRECTION
      ? {
          stringValue:
            score.dataType === ScoreDataTypeEnum.CORRECTION
              ? score.longStringValue
              : (score.stringValue ?? null),
        }
      : {}),
  }));

  const observations = observationRecords.map((record) => {
    return {
      id: record.id,
      traceId: record.traceId ?? traceId,
      userId: record.userId ?? null,
      sessionId: record.sessionId ?? null,
      projectId: record.projectId,
      startTime: record.startTime.toISOString(),
      endTime: record.endTime?.toISOString() ?? null,
      parentObservationId: record.parentObservationId ?? null,
      type: record.type,
      environment: record.environment,
      name: record.name ?? null,
      level: record.level ?? null,
      traceName: record.traceName ?? trace.name ?? "",
      statusMessage: record.statusMessage ?? null,
      release: record.release ?? null,
      version: record.version ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      model: record.model ?? null,
      modelParameters: record.modelParameters,
      internalModelId: record.internalModelId ?? null,
      completionStartTime: record.completionStartTime?.toISOString() ?? null,
      promptId: record.promptId ?? null,
      promptName: record.promptName ?? null,
      promptVersion: record.promptVersion ?? null,
      providedUsageDetails: record.providedUsageDetails,
      latency: getDurationSeconds(record.startTime, record.endTime),
      timeToFirstToken: getDurationSeconds(
        record.startTime,
        record.completionStartTime,
      ),
      usageDetails: record.usageDetails,
      costDetails: record.costDetails,
      providedCostDetails: record.providedCostDetails,
      usagePricingTierId: record.usagePricingTierId ?? null,
      usagePricingTierName: record.usagePricingTierName ?? null,
      toolCallNames: record.toolCallNames ?? [],
      tags: trace.tags,
      bookmarked: trace.bookmarked,
      public: trace.public,
      ...(!omitLargeFields
        ? {
            toolDefinitions: record.toolDefinitions ?? {},
            toolCalls: record.toolCalls ?? [],
            input: record.input,
            output: record.output,
            metadata: record.metadata ?? {},
          }
        : {}),
    };
  });

  return {
    observations,
    scores,
  };
}
