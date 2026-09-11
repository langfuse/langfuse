import { type ScoreDomain } from "@langfuse/shared";

import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

/**
 * A session-level score row exactly as `sessions.byIdWithScoresFromEvents`
 * returns it. `ModernSessionHeader` renders scores with `ScoreBadge`, which
 * reads the comment and metadata fields too, so its stories and tests need
 * whole rows rather than the name/value pair the old pill used.
 */
export type ModernSessionHeaderScore = WithStringifiedMetadata<ScoreDomain>;

/** Numeric session score; the only shape the header's stories/tests need. */
export const modernSessionHeaderScore = ({
  id,
  name,
  value = 0,
  comment = null,
  metadata = null,
}: {
  id: string;
  name: string;
  value?: number;
  comment?: string | null;
  metadata?: string | null;
}): ModernSessionHeaderScore => ({
  id,
  name,
  value,
  comment,
  metadata,
  stringValue: null,
  dataType: "NUMERIC",
  projectId: "project-1",
  environment: "default",
  source: "API",
  authorUserId: null,
  configId: null,
  queueId: null,
  executionTraceId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  timestamp: new Date("2026-01-01T00:00:00.000Z"),
  traceId: null,
  sessionId: "session-1",
  datasetRunId: null,
  observationId: null,
  longStringValue: "",
});
