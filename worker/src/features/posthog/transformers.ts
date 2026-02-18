import { v5 } from "uuid";
import type {
  AnalyticsTraceEvent,
  AnalyticsGenerationEvent,
  AnalyticsScoreEvent,
  AnalyticsObservationEvent,
} from "@langfuse/shared/src/server";

// UUID v5 namespace for PostHog
const POSTHOG_UUID_NAMESPACE = "0f6c91df-d035-4813-b838-9741ba38ef0b";

type PostHogEvent = {
  distinctId: string;
  event: string;
  properties: Record<string, unknown>;
  timestamp: Date;
  uuid: string;
};

export const transformTraceForPostHog = (
  trace: AnalyticsTraceEvent,
  projectId: string,
): PostHogEvent => {
  const uuid = v5(`${projectId}-${trace.langfuse_id}`, POSTHOG_UUID_NAMESPACE);

  // Extract posthog_session_id and map to $session_id

  const { posthog_session_id, mixpanel_session_id, ...otherProps } = trace;

  return {
    distinctId: trace.langfuse_user_id
      ? (trace.langfuse_user_id as string)
      : uuid,
    event: "langfuse trace",
    properties: {
      ...otherProps,
      $session_id: posthog_session_id ?? null,
      // PostHog-specific: add user profile enrichment or mark as anonymous
      ...(trace.langfuse_user_id && trace.langfuse_user_url
        ? {
            $set: {
              langfuse_user_url: trace.langfuse_user_url,
            },
          }
        : // Capture as anonymous PostHog event (cheaper/faster)
          // https://posthog.com/docs/data/anonymous-vs-identified-events?tab=Backend
          { $process_person_profile: false }),
    },
    timestamp: trace.timestamp as Date,
    uuid,
  };
};

export const transformGenerationForPostHog = (
  generation: AnalyticsGenerationEvent,
  projectId: string,
): PostHogEvent => {
  const uuid = v5(
    `${projectId}-${generation.langfuse_id}`,
    POSTHOG_UUID_NAMESPACE,
  );

  // Extract posthog_session_id and map to $session_id

  const { posthog_session_id, mixpanel_session_id, ...otherProps } = generation;

  return {
    distinctId: generation.langfuse_user_id
      ? (generation.langfuse_user_id as string)
      : uuid,
    event: "langfuse generation",
    properties: {
      ...otherProps,
      $session_id: posthog_session_id ?? null,
      // PostHog-specific: add user profile enrichment or mark as anonymous
      ...(generation.langfuse_user_id && generation.langfuse_user_url
        ? {
            $set: {
              langfuse_user_url: generation.langfuse_user_url,
            },
          }
        : // Capture as anonymous PostHog event (cheaper/faster)
          // https://posthog.com/docs/data/anonymous-vs-identified-events?tab=Backend
          { $process_person_profile: false }),
    },
    timestamp: generation.timestamp as Date,
    uuid,
  };
};

export const transformScoreForPostHog = (
  score: AnalyticsScoreEvent,
  projectId: string,
): PostHogEvent => {
  const uuid = v5(`${projectId}-${score.langfuse_id}`, POSTHOG_UUID_NAMESPACE);

  // Extract posthog_session_id and map to $session_id

  const { posthog_session_id, mixpanel_session_id, ...otherProps } = score;

  return {
    distinctId: score.langfuse_user_id
      ? (score.langfuse_user_id as string)
      : uuid,
    event: "langfuse score",
    properties: {
      ...otherProps,
      $session_id: posthog_session_id ?? null,
      // PostHog-specific: add user profile enrichment or mark as anonymous
      ...(score.langfuse_user_id && score.langfuse_user_url
        ? {
            $set: {
              langfuse_user_url: score.langfuse_user_url,
            },
          }
        : // Capture as anonymous PostHog event (cheaper/faster)
          // https://posthog.com/docs/data/anonymous-vs-identified-events?tab=Backend
          { $process_person_profile: false }),
    },
    timestamp: score.timestamp as Date,
    uuid,
  };
};

export const transformEventForPostHog = (
  event: AnalyticsObservationEvent,
  projectId: string,
): PostHogEvent => {
  const uuid = v5(`${projectId}-${event.langfuse_id}`, POSTHOG_UUID_NAMESPACE);

  // Extract posthog_session_id and map to $session_id

  const { posthog_session_id, mixpanel_session_id, ...otherProps } = event;

  return {
    distinctId: event.langfuse_user_id
      ? (event.langfuse_user_id as string)
      : uuid,
    event: "langfuse observation",
    properties: {
      ...otherProps,
      $session_id: posthog_session_id ?? null,
      // PostHog-specific: add user profile enrichment or mark as anonymous
      ...(event.langfuse_user_id && event.langfuse_user_url
        ? {
            $set: {
              langfuse_user_url: event.langfuse_user_url,
            },
          }
        : // Capture as anonymous PostHog event (cheaper/faster)
          // https://posthog.com/docs/data/anonymous-vs-identified-events?tab=Backend
          { $process_person_profile: false }),
    },
    timestamp: event.timestamp as Date,
    uuid,
  };
};
