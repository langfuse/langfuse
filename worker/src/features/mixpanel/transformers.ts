import { v5 } from "uuid";
import type {
  AnalyticsTraceEvent,
  AnalyticsGenerationEvent,
  AnalyticsScoreEvent,
  AnalyticsObservationEvent,
} from "@langfuse/shared/src/server";

// UUID v5 namespace for Mixpanel (different from PostHog)
const MIXPANEL_UUID_NAMESPACE = "8f7c3e42-9a1b-4d5f-8e2a-1c6b9d3f4e7a";

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

  return {
    event: "[Langfuse] Trace",
    properties: {
      time: new Date(trace.timestamp as Date).getTime(),
      distinct_id: trace.langfuse_user_id
        ? (trace.langfuse_user_id as string)
        : insertId,
      $insert_id: insertId,
      ...(trace.langfuse_user_id
        ? { $user_id: trace.langfuse_user_id as string }
        : {}),
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

  return {
    event: "[Langfuse] Generation",
    properties: {
      time: new Date(generation.timestamp as Date).getTime(),
      distinct_id: generation.langfuse_user_id
        ? (generation.langfuse_user_id as string)
        : insertId,
      $insert_id: insertId,
      ...(generation.langfuse_user_id
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

  return {
    event: "[Langfuse] Score",
    properties: {
      time: new Date(score.timestamp as Date).getTime(),
      distinct_id: score.langfuse_user_id
        ? (score.langfuse_user_id as string)
        : insertId,
      $insert_id: insertId,
      ...(score.langfuse_user_id
        ? { $user_id: score.langfuse_user_id as string }
        : {}),
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

  return {
    event: "[Langfuse] Observation",
    properties: {
      time: new Date(event.timestamp as Date).getTime(),
      distinct_id: event.langfuse_user_id
        ? (event.langfuse_user_id as string)
        : insertId,
      $insert_id: insertId,
      ...(event.langfuse_user_id
        ? { $user_id: event.langfuse_user_id as string }
        : {}),
      session_id:
        mixpanel_session_id || event.langfuse_session_id
          ? (mixpanel_session_id as string) ||
            (event.langfuse_session_id as string)
          : undefined,
      ...otherProps,
    },
  };
};
