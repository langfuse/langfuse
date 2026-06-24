import { env } from "../../env";
import { recordGauge, traceException } from "../instrumentation";
import { logger } from "../logger";
import { redis } from "./redis";

export const INGESTION_FAILURE_ACTIVE_PROJECTS_KEY =
  "langfuse:ingestion-failure:active-projects";
const INGESTION_FAILURE_ACTIVE_PROJECTS_METRIC =
  "langfuse.ingestion.project_failure.active_projects";

const MARK_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_PROJECT_MARKS_PER_WINDOW = 100;

const recentProjectMarks = new Map<string, number>();

export type IngestionFailureSource =
  | "process_event_batch"
  | "ingestion_queue"
  | "otel_ingestion_queue"
  | "public_ingestion_api"
  | "public_otel_api";

export type IngestionFailureReason =
  | "api_internal_error"
  | "processing_error"
  | "publish_failed"
  | "s3_slowdown"
  | "s3_upload_error";

function shouldRecordProjectMark(projectId: string, now: number): boolean {
  for (const [cachedProjectId, cachedAt] of recentProjectMarks) {
    if (now - cachedAt >= MARK_RATE_LIMIT_WINDOW_MS) {
      recentProjectMarks.delete(cachedProjectId);
    }
  }

  if (recentProjectMarks.has(projectId)) {
    return false;
  }

  if (recentProjectMarks.size >= MAX_PROJECT_MARKS_PER_WINDOW) {
    return false;
  }

  recentProjectMarks.set(projectId, now);
  return true;
}

function logMarkFailure(
  projectId: string,
  tags: {
    source: IngestionFailureSource;
    reason?: IngestionFailureReason;
  },
  error: unknown,
): void {
  logger.error("Failed to mark project ingestion failure", {
    projectId,
    source: tags.source,
    reason: tags.reason,
    error,
  });
  traceException(error);
}

export function markProjectIngestFailure(
  projectId: string,
  tags: {
    source: IngestionFailureSource;
    reason?: IngestionFailureReason;
  },
): void {
  if (!redis) return;

  const now = Date.now();
  if (!shouldRecordProjectMark(projectId, now)) return;

  const ttlSeconds = env.LANGFUSE_INGEST_FAILURE_PROJECT_TTL_SECONDS;
  const expiresAtMs = now + ttlSeconds * 1000;

  try {
    redis
      .pipeline()
      .zadd(INGESTION_FAILURE_ACTIVE_PROJECTS_KEY, expiresAtMs, projectId)
      .expire(INGESTION_FAILURE_ACTIVE_PROJECTS_KEY, ttlSeconds + 60)
      .exec()
      .then((results) => {
        const commandError = results?.find(([error]) => error)?.[0];
        if (commandError) {
          logMarkFailure(projectId, tags, commandError);
        }
      })
      .catch((error) => {
        logMarkFailure(projectId, tags, error);
      });
  } catch (error) {
    logMarkFailure(projectId, tags, error);
  }
}

export async function updateActiveIngestFailureProjectsMetric(): Promise<
  number | null
> {
  if (!redis) return null;

  try {
    const results = await redis
      .pipeline()
      .zremrangebyscore(INGESTION_FAILURE_ACTIVE_PROJECTS_KEY, 0, Date.now())
      .zcard(INGESTION_FAILURE_ACTIVE_PROJECTS_KEY)
      .exec();

    const commandError = results?.find(([error]) => error)?.[0];
    if (commandError) throw commandError;

    const activeProjects = Number(results?.[1]?.[1] ?? 0);

    recordGauge(INGESTION_FAILURE_ACTIVE_PROJECTS_METRIC, activeProjects, {
      unit: "projects",
    });

    return activeProjects;
  } catch (error) {
    logger.error("Failed to record active ingestion failure projects", {
      error,
    });
    traceException(error);
    return null;
  }
}
