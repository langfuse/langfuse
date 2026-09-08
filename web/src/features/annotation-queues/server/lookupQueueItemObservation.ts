import { env } from "@/src/env.mjs";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  getObservationById,
  getObservationByIdFromEventsTable,
} from "@langfuse/shared/src/server";

/**
 * Resolve the observation referenced by an annotation-queue item.
 *
 * `objectStartTime` (persisted on the queue item at enqueue) bounds the
 * events_full lookup to the observation's day so ClickHouse can prune
 * partitions/parts. The value can originate from a client-supplied hint on the
 * public create API, so a wrong or stale day would bound the lookup to the
 * wrong day and hide an existing observation. Retry once unbounded on a miss so
 * the hint can only ever speed up a hit, never turn into a false "not found".
 */
export const lookupQueueItemObservation = async ({
  objectId,
  projectId,
  objectStartTime,
}: {
  objectId: string;
  projectId: string;
  objectStartTime: Date | null;
}) => {
  const lookup = (startTime?: Date) =>
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
      ? getObservationByIdFromEventsTable({
          id: objectId,
          projectId,
          startTime,
        })
      : // eslint-disable-next-line @typescript-eslint/no-deprecated
        getObservationById({ id: objectId, projectId, startTime });

  if (!objectStartTime) {
    return lookup();
  }
  try {
    return await lookup(objectStartTime);
  } catch (e) {
    // The bounded lookups throw LangfuseNotFoundError on an empty result rather
    // than returning null, so a wrong/stale hint surfaces here. Retry unbounded
    // before giving up; any other error is a real failure and propagates.
    if (e instanceof LangfuseNotFoundError) {
      return lookup();
    }
    throw e;
  }
};
