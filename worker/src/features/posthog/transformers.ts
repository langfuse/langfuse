import { v5 } from "uuid";
import type {
  AnalyticsTraceEvent,
  AnalyticsGenerationEvent,
  AnalyticsScoreEvent,
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

/**
 * Determines the PostHog distinctId for an event.
 * Priority: posthog_distinct_id (from metadata) > langfuse_user_id > generated UUID
 * This allows users to map Langfuse traces to their existing PostHog user identities.
 */
const getDistinctId = (
  posthogDistinctId: unknown,
  langfuseUserId: unknown,
  fallbackUuid: string,
): string => {
  if (posthogDistinctId) {
    return posthogDistinctId as string;
  }
  if (langfuseUserId) {
    return langfuseUserId as string;
  }
  return fallbackUuid;
};

/**
 * Determines if this event should have person profile processing.
 * Returns true if we have a user identity (either posthog_distinct_id or langfuse_user_id with user_url).
 */
const hasUserIdentity = (
  posthogDistinctId: unknown,
  langfuseUserId: unknown,
  langfuseUserUrl: unknown,
): boolean => {
  return (
    Boolean(posthogDistinctId) || Boolean(langfuseUserId && langfuseUserUrl)
  );
};

export const transformTraceForPostHog = (
  trace: AnalyticsTraceEvent,
  projectId: string,
): PostHogEvent => {
  const uuid = v5(`${projectId}-${trace.langfuse_id}`, POSTHOG_UUID_NAMESPACE);

  // Extract PostHog-specific fields to map to PostHog properties
  const {
    posthog_session_id,
    posthog_distinct_id,
    mixpanel_session_id,
    ...otherProps
  } = trace;

  const distinctId = getDistinctId(
    posthog_distinct_id,
    trace.langfuse_user_id,
    uuid,
  );

  return {
    distinctId,
    event: "langfuse trace",
    properties: {
      ...otherProps,
      $session_id: posthog_session_id ?? null,
      // PostHog-specific: add user profile enrichment or mark as anonymous
      ...(hasUserIdentity(
        posthog_distinct_id,
        trace.langfuse_user_id,
        trace.langfuse_user_url,
      )
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

  // Extract PostHog-specific fields to map to PostHog properties
  const {
    posthog_session_id,
    posthog_distinct_id,
    mixpanel_session_id,
    ...otherProps
  } = generation;

  const distinctId = getDistinctId(
    posthog_distinct_id,
    generation.langfuse_user_id,
    uuid,
  );

  return {
    distinctId,
    event: "langfuse generation",
    properties: {
      ...otherProps,
      $session_id: posthog_session_id ?? null,
      // PostHog-specific: add user profile enrichment or mark as anonymous
      ...(hasUserIdentity(
        posthog_distinct_id,
        generation.langfuse_user_id,
        generation.langfuse_user_url,
      )
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

  // Extract PostHog-specific fields to map to PostHog properties
  const {
    posthog_session_id,
    posthog_distinct_id,
    mixpanel_session_id,
    ...otherProps
  } = score;

  const distinctId = getDistinctId(
    posthog_distinct_id,
    score.langfuse_user_id,
    uuid,
  );

  return {
    distinctId,
    event: "langfuse score",
    properties: {
      ...otherProps,
      $session_id: posthog_session_id ?? null,
      // PostHog-specific: add user profile enrichment or mark as anonymous
      ...(hasUserIdentity(
        posthog_distinct_id,
        score.langfuse_user_id,
        score.langfuse_user_url,
      )
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
