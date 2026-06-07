import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DEFAULT_CROSS_PROJECT_TRACE_CORRELATION_KEY } from "@/src/features/trace-correlation/constants";
import {
  getRelatedTracesByMetadataCorrelation,
  getRelatedTracesByMetadataCorrelationFromEventsTable,
  getTraceById,
  getTraceByIdFromEventsTable,
  recordDistribution,
  recordIncrement,
  type RelatedTraceLookupRecord,
} from "@langfuse/shared/src/server";
import { LangfuseNotFoundError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";

const RELATED_TRACE_LIMIT = 50;
// Query one extra row per project chunk to detect truncation without loading
// every match across large orgs. This is a navigation aid, not a globally
// exhaustive top-N query across all chunks.
const RELATED_TRACE_QUERY_LIMIT = RELATED_TRACE_LIMIT + 1;
const RELATED_TRACE_PROJECT_BATCH_SIZE = 250;
const RELATED_TRACE_PROJECT_BATCH_CONCURRENCY = 3;
const WINDOW_PADDING_MS = 60 * 60 * 1000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

export type RelatedTraceLink = {
  projectId: string;
  projectName: string;
  traceId: string;
  traceName: string | null;
  timestamp: Date;
  htmlPath: string;
  source: RelatedTraceLookupRecord["source"];
};

export type RelatedTracesAcrossProjectsResponse = {
  enabled: boolean;
  related: RelatedTraceLink[];
  truncated: boolean;
  correlationKey: string | null;
  correlationStatus: "disabled" | "not_checked" | "missing" | "matched";
};

type TraceCorrelationSource = "traces" | "events_core";

const isValidDate = (date: Date | null | undefined): date is Date =>
  date instanceof Date && Number.isFinite(date.getTime());

const extractTraceCorrelationValue = (
  metadata: Record<string, unknown> | null | undefined,
  correlationKey: string,
) => {
  const value = metadata?.[correlationKey];

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
};

export const buildTraceCorrelationTimeWindow = ({
  minStartTime,
  maxStartTime,
  fallbackTimestamp,
}: {
  minStartTime?: Date | null;
  maxStartTime?: Date | null;
  fallbackTimestamp: Date;
}) => {
  const hasObservationWindow =
    isValidDate(minStartTime) &&
    isValidDate(maxStartTime) &&
    minStartTime.getTime() <= maxStartTime.getTime();

  const baseFrom = hasObservationWindow ? minStartTime : fallbackTimestamp;
  const baseTo = hasObservationWindow ? maxStartTime : fallbackTimestamp;

  let fromTimestamp = new Date(baseFrom.getTime() - WINDOW_PADDING_MS);
  let toTimestamp = new Date(baseTo.getTime() + WINDOW_PADDING_MS);

  if (toTimestamp.getTime() - fromTimestamp.getTime() > MAX_WINDOW_MS) {
    const midpoint = (fromTimestamp.getTime() + toTimestamp.getTime()) / 2;
    fromTimestamp = new Date(midpoint - MAX_WINDOW_MS / 2);
    toTimestamp = new Date(midpoint + MAX_WINDOW_MS / 2);
  }

  return {
    fromTimestamp,
    toTimestamp,
  };
};

const buildTraceHtmlPath = (record: RelatedTraceLookupRecord) => {
  const queryParams = new URLSearchParams({
    timestamp: record.timestamp.toISOString(),
  });

  return `/project/${record.projectId}/traces/${encodeURIComponent(
    record.traceId,
  )}?${queryParams.toString()}`;
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const sortRelatedTraceLookupRecords = (records: RelatedTraceLookupRecord[]) => {
  return [...records].sort((left, right) => {
    const timestampComparison =
      left.timestamp.getTime() - right.timestamp.getTime();
    if (timestampComparison !== 0) return timestampComparison;

    return left.projectId.localeCompare(right.projectId);
  });
};

const getReadableTargetProjectIds = ({
  session,
  sourceOrgId,
  sourceProjectId,
}: {
  session: Session;
  sourceOrgId: string;
  sourceProjectId: string;
}) => {
  if (session.user?.admin === true) return null;

  const sourceOrg = session.user?.organizations.find(
    (org) => org.id === sourceOrgId,
  );

  return (
    sourceOrg?.projects
      .filter((project) => project.id !== sourceProjectId)
      .filter((project) =>
        hasProjectAccess({
          session,
          projectId: project.id,
          scope: "project:read",
        }),
      )
      .map((project) => project.id) ?? []
  );
};

const validateSourceTraceExists = async ({
  source,
  sourceProjectId,
  traceId,
  timestamp,
}: {
  source: TraceCorrelationSource;
  sourceProjectId: string;
  traceId: string;
  timestamp?: Date | null;
}) => {
  const trace =
    source === "events_core"
      ? await getTraceByIdFromEventsTable({
          projectId: sourceProjectId,
          traceId,
          timestamp: timestamp ?? undefined,
          clickhouseFeatureTag: "tracing-trpc",
          renderingProps: {
            truncated: true,
            shouldJsonParse: false,
          },
        })
      : await getLegacyTraceByIdForCorrelation({
          sourceProjectId,
          traceId,
          timestamp,
        });

  if (!trace) {
    throw new LangfuseNotFoundError("Trace not found");
  }

  return trace;
};

const getLegacyTraceByIdForCorrelation = async ({
  sourceProjectId,
  traceId,
  timestamp,
}: {
  sourceProjectId: string;
  traceId: string;
  timestamp?: Date | null;
}) =>
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Legacy users still read related traces from the legacy traces table.
  getTraceById({
    projectId: sourceProjectId,
    traceId,
    timestamp: timestamp ?? undefined,
    clickhouseFeatureTag: "tracing-trpc",
    excludeInputOutput: true,
  });

const lookupRelatedTraceRecordsInProjectBatches = async ({
  source,
  targetProjectIds,
  correlationKey,
  correlationValue,
  fromTimestamp,
  toTimestamp,
  sourceProjectId,
}: {
  source: TraceCorrelationSource;
  targetProjectIds: string[];
  correlationKey: string;
  correlationValue: string;
  fromTimestamp: Date;
  toTimestamp: Date;
  sourceProjectId: string;
}) => {
  const projectIdChunks = chunkArray(
    targetProjectIds,
    RELATED_TRACE_PROJECT_BATCH_SIZE,
  );
  const records: RelatedTraceLookupRecord[] = [];

  for (
    let chunkIndex = 0;
    chunkIndex < projectIdChunks.length;
    chunkIndex += RELATED_TRACE_PROJECT_BATCH_CONCURRENCY
  ) {
    const chunkGroup = projectIdChunks.slice(
      chunkIndex,
      chunkIndex + RELATED_TRACE_PROJECT_BATCH_CONCURRENCY,
    );

    const chunkRecords = await Promise.all(
      chunkGroup.map((projectIds) =>
        source === "events_core"
          ? getRelatedTracesByMetadataCorrelationFromEventsTable({
              projectIds,
              correlationKey,
              correlationValue,
              fromTimestamp,
              toTimestamp,
              limit: RELATED_TRACE_QUERY_LIMIT,
              sourceProjectId,
            })
          : getRelatedTracesByMetadataCorrelation({
              projectIds,
              correlationKey,
              correlationValue,
              fromTimestamp,
              toTimestamp,
              limit: RELATED_TRACE_QUERY_LIMIT,
              sourceProjectId,
            }),
      ),
    );

    records.push(...chunkRecords.flat());
  }

  recordDistribution(
    "langfuse.trace_correlation.project_count",
    targetProjectIds.length,
    {
      source,
    },
  );
  recordDistribution(
    "langfuse.trace_correlation.chunk_count",
    projectIdChunks.length,
    {
      source,
    },
  );

  return sortRelatedTraceLookupRecords(records);
};

export const getRelatedTracesAcrossProjects = async ({
  prisma,
  session,
  sourceOrgId,
  sourceProjectId,
  traceId,
  minStartTime,
  maxStartTime,
  timestamp,
  source,
}: {
  prisma: PrismaClient;
  session: Session;
  sourceOrgId: string;
  sourceProjectId: string;
  traceId: string;
  minStartTime?: Date | null;
  maxStartTime?: Date | null;
  timestamp?: Date | null;
  source: TraceCorrelationSource;
}): Promise<RelatedTracesAcrossProjectsResponse> => {
  const organization = await prisma.organization.findUnique({
    where: { id: sourceOrgId },
    select: {
      crossProjectTraceTrackingEnabled: true,
      crossProjectTraceCorrelationKey: true,
    },
  });

  if (!organization) {
    throw new LangfuseNotFoundError("Organization not found");
  }

  if (!organization.crossProjectTraceTrackingEnabled) {
    recordIncrement("langfuse.trace_correlation.query", 1, {
      enabled: 0,
      source,
    });

    return {
      enabled: false,
      related: [],
      truncated: false,
      correlationKey: null,
      correlationStatus: "disabled",
    };
  }

  const correlationKey =
    organization.crossProjectTraceCorrelationKey ||
    DEFAULT_CROSS_PROJECT_TRACE_CORRELATION_KEY;

  const readableTargetProjectIds = getReadableTargetProjectIds({
    session,
    sourceOrgId,
    sourceProjectId,
  });

  if (readableTargetProjectIds && readableTargetProjectIds.length === 0) {
    recordIncrement("langfuse.trace_correlation.query", 1, {
      enabled: 1,
      source,
    });
    recordDistribution("langfuse.trace_correlation.result_count", 0, {
      source,
      truncated: 0,
    });

    return {
      enabled: true,
      related: [],
      truncated: false,
      correlationKey,
      correlationStatus: "not_checked",
    };
  }

  const targetProjects = await prisma.project.findMany({
    where: {
      orgId: sourceOrgId,
      deletedAt: null,
      id: {
        not: sourceProjectId,
        ...(readableTargetProjectIds ? { in: readableTargetProjectIds } : {}),
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const targetProjectIds = targetProjects.map((project) => project.id);

  if (targetProjectIds.length === 0) {
    recordIncrement("langfuse.trace_correlation.query", 1, {
      enabled: 1,
      source,
    });
    recordDistribution("langfuse.trace_correlation.result_count", 0, {
      source,
      truncated: 0,
    });

    return {
      enabled: true,
      related: [],
      truncated: false,
      correlationKey,
      correlationStatus: "not_checked",
    };
  }

  const sourceTrace = await validateSourceTraceExists({
    source,
    sourceProjectId,
    traceId,
    timestamp,
  });

  const { fromTimestamp, toTimestamp } = buildTraceCorrelationTimeWindow({
    minStartTime,
    maxStartTime,
    fallbackTimestamp:
      timestamp && isValidDate(timestamp) ? timestamp : sourceTrace.timestamp,
  });

  const correlationValue = extractTraceCorrelationValue(
    sourceTrace.metadata,
    correlationKey,
  );

  if (!correlationValue) {
    recordIncrement("langfuse.trace_correlation.query", 1, {
      enabled: 1,
      source,
      correlationStatus: "missing",
    });
    recordDistribution("langfuse.trace_correlation.result_count", 0, {
      source,
      truncated: 0,
      correlationStatus: "missing",
    });

    return {
      enabled: true,
      related: [],
      truncated: false,
      correlationKey,
      correlationStatus: "missing",
    };
  }

  recordIncrement("langfuse.trace_correlation.query", 1, {
    enabled: 1,
    source,
    correlationStatus: "matched",
  });

  const lookupRecords = await lookupRelatedTraceRecordsInProjectBatches({
    source,
    targetProjectIds,
    correlationKey,
    correlationValue,
    fromTimestamp,
    toTimestamp,
    sourceProjectId,
  });

  const truncated = lookupRecords.length > RELATED_TRACE_LIMIT;
  const projectsById = new Map(
    targetProjects.map((project) => [project.id, project]),
  );
  const related = lookupRecords
    .slice(0, RELATED_TRACE_LIMIT)
    .flatMap((record): RelatedTraceLink[] => {
      const project = projectsById.get(record.projectId);
      if (!project) return [];

      return [
        {
          projectId: record.projectId,
          projectName: project.name,
          traceId: record.traceId,
          traceName: record.traceName,
          timestamp: record.timestamp,
          htmlPath: buildTraceHtmlPath(record),
          source: record.source,
        },
      ];
    });

  recordDistribution(
    "langfuse.trace_correlation.result_count",
    related.length,
    {
      source,
      truncated: truncated ? 1 : 0,
      correlationStatus: "matched",
    },
  );

  return {
    enabled: true,
    related,
    truncated,
    correlationKey,
    correlationStatus: "matched",
  };
};
