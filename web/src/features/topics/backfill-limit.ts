import { TOPICS_SLICE_MAX_TRACES } from "@langfuse/shared/topics";

/** Process past traces selects at most this many random traces. */
export const TOPICS_BACKFILL_TRACE_LIMIT = TOPICS_SLICE_MAX_TRACES;
