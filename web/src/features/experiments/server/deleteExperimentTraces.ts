import { chunk } from "lodash";
import { InvalidRequestError } from "@langfuse/shared";
import {
  listExperimentTracePairs,
  traceDeletionProcessor,
} from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { type ProjectAuthedContext } from "@/src/server/api/trpc";

/** Distinct traces one experiment delete may enqueue. Above this, delete nothing. */
export const EXPERIMENT_TRACE_DELETE_MAX_TRACES = 10_000;

/**
 * Ids per `traceDeletionProcessor` call. Matches the worker
 * `LANGFUSE_DELETE_BATCH_SIZE` default: one trace-delete job deletes at most
 * that many ids, and a larger payload waits for a later job.
 */
const EXPERIMENT_TRACE_DELETE_CHUNK_SIZE = 2_000;

const EXPERIMENT_TRACE_DELETE_CAP_MESSAGE =
  "These experiments include more than 10,000 traces. Select fewer experiments, down to one at a time, and try again.";

/**
 * Resolve selected experiment ids to trace ids and delete those traces by id.
 * One ClickHouse read. Over the cap, nothing is audited and nothing is queued.
 */
export async function deleteExperimentTraces(params: {
  projectId: string;
  experimentIds: string[];
  session: ProjectAuthedContext["session"];
}): Promise<void> {
  const pairs = await listExperimentTracePairs({
    projectId: params.projectId,
    experimentIds: params.experimentIds,
    limit: EXPERIMENT_TRACE_DELETE_MAX_TRACES + 1,
  });

  if (pairs.length > EXPERIMENT_TRACE_DELETE_MAX_TRACES) {
    throw new InvalidRequestError(EXPERIMENT_TRACE_DELETE_CAP_MESSAGE);
  }

  const traceCountByExperimentId = new Map<string, number>(
    params.experimentIds.map((experimentId) => [experimentId, 0]),
  );
  const traceIds: string[] = [];
  const seenTraceIds = new Set<string>();

  for (const pair of pairs) {
    traceCountByExperimentId.set(
      pair.experimentId,
      (traceCountByExperimentId.get(pair.experimentId) ?? 0) + 1,
    );
    if (!seenTraceIds.has(pair.traceId)) {
      seenTraceIds.add(pair.traceId);
      traceIds.push(pair.traceId);
    }
  }

  await Promise.all(
    params.experimentIds.map((experimentId) =>
      auditLog({
        session: params.session,
        resourceType: "experiment",
        resourceId: experimentId,
        action: "delete",
        after: {
          traceCount: traceCountByExperimentId.get(experimentId) ?? 0,
        },
      }),
    ),
  );

  const userId = params.session.user.id;
  for (const traceIdChunk of chunk(
    traceIds,
    EXPERIMENT_TRACE_DELETE_CHUNK_SIZE,
  )) {
    await traceDeletionProcessor(params.projectId, traceIdChunk, {
      actor: { type: "USER", userId },
    });
  }
}
