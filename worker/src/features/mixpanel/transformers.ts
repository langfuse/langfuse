import { v5 } from "uuid";
import type {
  AnalyticsTraceEvent,
  AnalyticsGenerationEvent,
  AnalyticsScoreEvent,
  AnalyticsObservationEvent,
} from "@langfuse/shared/src/server";

// UUID v5 namespace for Mixpanel (different from PostHog)
const MIXPANEL_UUID_NAMESPACE = "8f7c3e42-9a1b-4d5f-8e2a-1c6b9d3f4e7a";

// Values that Mixpanel's /import?strict=1 API rejects as distinct_id.
const MIXPANEL_BAD_DISTINCT_IDS = new Set([
  "undefined",
  "null",
  "nil",
  "none",
  "unknown",
  "n/a",
  "na",
  "anon",
  "anonymous",
  "false",
  "true",
  "0",
  "-1",
  "00000000-0000-0000-0000-000000000000",
  "<nil>",
  "[]",
  "{}",
  "lmy47d",
]);

function isBadDistinctId(value: unknown): boolean {
  if (typeof value !== "string" || !value) return true;
  return MIXPANEL_BAD_DISTINCT_IDS.has(value.trim().toLowerCase());
}

export type MixpanelEvent = {
  event: string;
  properties: {
    time: number; // milliseconds since epoch
    distinct_id: string;
    $insert_id: string;
    $user_id?: string;
    session_id?: string;
    [key: string]: unknown;
  };
};

export const transformTraceForMixpanel = (
  trace: AnalyticsTraceEvent,
  projectId: string,
): MixpanelEvent => {
  const insertId = v5(
    `${projectId}-${trace.langfuse_id}`,
    MIXPANEL_UUID_NAMESPACE,
  );

  // Extract session IDs and exclude from properties

  const { posthog_session_id, mixpanel_session_id, ...otherProps } = trace;

  const hasValidUserId = !isBadDistinctId(trace.langfuse_user_id);

  return {
    event: "[Langfuse] Trace",
    properties: {
      time: new Date(trace.timestamp as Date).getTime(),
      distinct_id: hasValidUserId
        ? (trace.langfuse_user_id as string)
        : insertId,
      $insert_id: insertId,
      ...(hasValidUserId ? { $user_id: trace.langfuse_user_id as string } : {}),
      session_id:
        mixpanel_session_id || trace.langfuse_session_id
          ? (mixpanel_session_id as string) ||
            (trace.langfuse_session_id as string)
          : undefined,
      ...otherProps,
    },
  };
};

export const transformGenerationForMixpanel = (
  generation: AnalyticsGenerationEvent,
  projectId: string,
): MixpanelEvent => {
  const insertId = v5(
    `${projectId}-${generation.langfuse_id}`,
    MIXPANEL_UUID_NAMESPACE,
  );

  // Extract session IDs and exclude from properties

  const { posthog_session_id, mixpanel_session_id, ...otherProps } = generation;

  const hasValidUserId = !isBadDistinctId(generation.langfuse_user_id);

  return {
    event: "[Langfuse] Generation",
    properties: {
      time: new Date(generation.timestamp as Date).getTime(),
      distinct_id: hasValidUserId
        ? (generation.langfuse_user_id as string)
        : insertId,
      $insert_id: insertId,
      ...(hasValidUserId
        ? { $user_id: generation.langfuse_user_id as string }
        : {}),
      session_id:
        mixpanel_session_id || generation.langfuse_session_id
          ? (mixpanel_session_id as string) ||
            (generation.langfuse_session_id as string)
          : undefined,
      ...otherProps,
    },
  };
};

export const transformScoreForMixpanel = (
  score: AnalyticsScoreEvent,
  projectId: string,
): MixpanelEvent => {
  const insertId = v5(
    `${projectId}-${score.langfuse_id}`,
    MIXPANEL_UUID_NAMESPACE,
  );

  // Extract session IDs and exclude from properties

  const { posthog_session_id, mixpanel_session_id, ...otherProps } = score;

  const hasValidUserId = !isBadDistinctId(score.langfuse_user_id);

  return {
    event: "[Langfuse] Score",
    properties: {
      time: new Date(score.timestamp as Date).getTime(),
      distinct_id: hasValidUserId
        ? (score.langfuse_user_id as string)
        : insertId,
      $insert_id: insertId,
      ...(hasValidUserId ? { $user_id: score.langfuse_user_id as string } : {}),
      session_id:
        mixpanel_session_id || score.langfuse_session_id
          ? (mixpanel_session_id as string) ||
            (score.langfuse_session_id as string)
          : undefined,
      ...otherProps,
    },
  };
};

export const transformEventForMixpanel = (
  event: AnalyticsObservationEvent,
  projectId: string,
): MixpanelEvent => {
  const insertId = v5(
    `${projectId}-${event.langfuse_id}`,
    MIXPANEL_UUID_NAMESPACE,
  );

  // Extract session IDs and exclude from properties

  const { posthog_session_id, mixpanel_session_id, ...otherProps } = event;

  const hasValidUserId = !isBadDistinctId(event.langfuse_user_id);

  return {
    event: "[Langfuse] Observation",
    properties: {
      time: new Date(event.timestamp as Date).getTime(),
      distinct_id: hasValidUserId
        ? (event.langfuse_user_id as string)
        : insertId,
      $insert_id: insertId,
      ...(hasValidUserId ? { $user_id: event.langfuse_user_id as string } : {}),
      session_id:
        mixpanel_session_id || event.langfuse_session_id
          ? (mixpanel_session_id as string) ||
            (event.langfuse_session_id as string)
          : undefined,
      ...otherProps,
    },
  };
};
