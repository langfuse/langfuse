import { describe, it, expect } from "vitest";
import {
  transformTraceForMixpanel,
  transformGenerationForMixpanel,
  transformScoreForMixpanel,
  transformEventForMixpanel,
} from "../features/mixpanel/transformers";
import type {
  AnalyticsTraceEvent,
  AnalyticsGenerationEvent,
  AnalyticsScoreEvent,
  AnalyticsObservationEvent,
} from "@langfuse/shared/src/server";

describe("Mixpanel transformers", () => {
  const projectId = "test-project-id";

  describe("transformEventForMixpanel", () => {
    it("should transform an event with user_id", () => {
      const event: AnalyticsObservationEvent = {
        langfuse_id: "event-123",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        langfuse_observation_name: "test-event",
        langfuse_trace_name: "test-trace",
        langfuse_trace_id: "trace-456",
        langfuse_url:
          "https://langfuse.com/project/test/traces/trace-456?observation=event-123",
        langfuse_user_url: "https://langfuse.com/project/test/users/user-789",
        langfuse_cost_usd: 0.001,
        langfuse_input_units: 100,
        langfuse_output_units: 50,
        langfuse_total_units: 150,
        langfuse_session_id: "session-abc",
        langfuse_project_id: projectId,
        langfuse_user_id: "user-789",
        langfuse_latency: 1.5,
        langfuse_time_to_first_token: 0.3,
        langfuse_release: "v1.0.0",
        langfuse_version: "1",
        langfuse_model: "gpt-4",
        langfuse_level: "DEFAULT",
        langfuse_type: "GENERATION",
        langfuse_tags: ["tag1", "tag2"],
        langfuse_environment: "production",
        langfuse_event_version: "1.0.0",
        posthog_session_id: "posthog-session-123",
        mixpanel_session_id: "mixpanel-session-456",
      };

      const result = transformEventForMixpanel(event, projectId);

      expect(result.event).toBe("[Langfuse] Observation");
      expect(result.properties.distinct_id).toBe("user-789");
      expect(result.properties.$user_id).toBe("user-789");
      expect(result.properties.time).toBe(
        new Date("2024-01-15T10:00:00Z").getTime(),
      );
      expect(result.properties.$insert_id).toBeDefined();
      expect(result.properties.session_id).toBe("mixpanel-session-456");
      expect(result.properties.langfuse_observation_name).toBe("test-event");
      expect(result.properties.langfuse_trace_name).toBe("test-trace");
      expect(result.properties.langfuse_model).toBe("gpt-4");
      expect(result.properties.langfuse_type).toBe("GENERATION");
      // Should not include posthog_session_id or mixpanel_session_id in properties
      expect(result.properties.posthog_session_id).toBeUndefined();
      expect(result.properties.mixpanel_session_id).toBeUndefined();
    });

    it("should transform an anonymous event without user_id", () => {
      const event: AnalyticsObservationEvent = {
        langfuse_id: "event-anonymous",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        langfuse_observation_name: "anonymous-event",
        langfuse_project_id: projectId,
        langfuse_user_id: null,
        langfuse_event_version: "1.0.0",
        posthog_session_id: null,
        mixpanel_session_id: null,
      };

      const result = transformEventForMixpanel(event, projectId);

      expect(result.event).toBe("[Langfuse] Observation");
      // distinct_id should be the generated $insert_id when no user_id
      expect(result.properties.distinct_id).toBe(result.properties.$insert_id);
      // Should not have $user_id for anonymous events
      expect(result.properties.$user_id).toBeUndefined();
      expect(result.properties.session_id).toBeUndefined();
    });

    it("should generate consistent insert IDs for the same event", () => {
      const event: AnalyticsObservationEvent = {
        langfuse_id: "event-consistent",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        langfuse_observation_name: "consistent-event",
        langfuse_project_id: projectId,
        langfuse_user_id: null,
        langfuse_event_version: "1.0.0",
        posthog_session_id: null,
        mixpanel_session_id: null,
      };

      const result1 = transformEventForMixpanel(event, projectId);
      const result2 = transformEventForMixpanel(event, projectId);

      expect(result1.properties.$insert_id).toBe(result2.properties.$insert_id);
    });

    it("should use langfuse_session_id when mixpanel_session_id is not available", () => {
      const event: AnalyticsObservationEvent = {
        langfuse_id: "event-with-langfuse-session",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        langfuse_observation_name: "session-event",
        langfuse_session_id: "langfuse-session-123",
        langfuse_project_id: projectId,
        langfuse_user_id: "user-456",
        langfuse_event_version: "1.0.0",
        posthog_session_id: null,
        mixpanel_session_id: null,
      };

      const result = transformEventForMixpanel(event, projectId);

      expect(result.properties.session_id).toBe("langfuse-session-123");
    });

    it("should prefer mixpanel_session_id over langfuse_session_id", () => {
      const event: AnalyticsObservationEvent = {
        langfuse_id: "event-with-both-sessions",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        langfuse_observation_name: "session-event",
        langfuse_session_id: "langfuse-session-123",
        langfuse_project_id: projectId,
        langfuse_user_id: "user-456",
        langfuse_event_version: "1.0.0",
        posthog_session_id: "posthog-session-789",
        mixpanel_session_id: "mixpanel-session-456",
      };

      const result = transformEventForMixpanel(event, projectId);

      expect(result.properties.session_id).toBe("mixpanel-session-456");
    });
  });

  describe("transformTraceForMixpanel", () => {
    it("should transform a trace with user_id", () => {
      const trace: AnalyticsTraceEvent = {
        langfuse_id: "trace-123",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        langfuse_trace_name: "test-trace",
        langfuse_url: "https://langfuse.com/project/test/traces/trace-123",
        langfuse_user_url: "https://langfuse.com/project/test/users/user-789",
        langfuse_cost_usd: 0.01,
        langfuse_count_observations: 5,
        langfuse_session_id: "session-abc",
        langfuse_project_id: projectId,
        langfuse_user_id: "user-789",
        langfuse_latency: 2.5,
        langfuse_release: "v1.0.0",
        langfuse_version: "1",
        langfuse_tags: ["tag1"],
        langfuse_environment: "production",
        langfuse_event_version: "1.0.0",
        posthog_session_id: null,
        mixpanel_session_id: "mixpanel-session-123",
      };

      const result = transformTraceForMixpanel(trace, projectId);

      expect(result.event).toBe("[Langfuse] Trace");
      expect(result.properties.distinct_id).toBe("user-789");
      expect(result.properties.$user_id).toBe("user-789");
      expect(result.properties.session_id).toBe("mixpanel-session-123");
    });
  });

  describe("transformGenerationForMixpanel", () => {
    it("should transform a generation with user_id", () => {
      const generation: AnalyticsGenerationEvent = {
        langfuse_id: "gen-123",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        langfuse_generation_name: "test-generation",
        langfuse_trace_name: "test-trace",
        langfuse_trace_id: "trace-456",
        langfuse_url:
          "https://langfuse.com/project/test/traces/trace-456?observation=gen-123",
        langfuse_user_url: "https://langfuse.com/project/test/users/user-789",
        langfuse_cost_usd: 0.005,
        langfuse_input_units: 200,
        langfuse_output_units: 100,
        langfuse_total_units: 300,
        langfuse_session_id: "session-abc",
        langfuse_project_id: projectId,
        langfuse_user_id: "user-789",
        langfuse_latency: 1.2,
        langfuse_time_to_first_token: 0.2,
        langfuse_release: "v1.0.0",
        langfuse_version: "1",
        langfuse_model: "gpt-4-turbo",
        langfuse_level: "DEFAULT",
        langfuse_tags: ["api"],
        langfuse_environment: "staging",
        langfuse_event_version: "1.0.0",
        posthog_session_id: null,
        mixpanel_session_id: "mixpanel-session-456",
      };

      const result = transformGenerationForMixpanel(generation, projectId);

      expect(result.event).toBe("[Langfuse] Generation");
      expect(result.properties.distinct_id).toBe("user-789");
      expect(result.properties.$user_id).toBe("user-789");
      expect(result.properties.session_id).toBe("mixpanel-session-456");
      expect(result.properties.langfuse_model).toBe("gpt-4-turbo");
    });
  });

  describe("transformScoreForMixpanel", () => {
    it("should transform a score with user_id", () => {
      const score: AnalyticsScoreEvent = {
        langfuse_id: "score-123",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        langfuse_score_name: "quality",
        langfuse_score_value: 0.95,
        langfuse_score_comment: "Good response",
        langfuse_score_metadata: { source: "human" },
        langfuse_score_string_value: null,
        langfuse_score_data_type: "NUMERIC",
        langfuse_trace_name: "test-trace",
        langfuse_trace_id: "trace-456",
        langfuse_user_url: "https://langfuse.com/project/test/users/user-789",
        langfuse_session_id: "session-abc",
        langfuse_project_id: projectId,
        langfuse_user_id: "user-789",
        langfuse_release: "v1.0.0",
        langfuse_tags: ["human-eval"],
        langfuse_environment: "production",
        langfuse_event_version: "1.0.0",
        langfuse_score_entity_type: "trace",
        langfuse_dataset_run_id: null,
        posthog_session_id: null,
        mixpanel_session_id: "mixpanel-session-789",
      };

      const result = transformScoreForMixpanel(score, projectId);

      expect(result.event).toBe("[Langfuse] Score");
      expect(result.properties.distinct_id).toBe("user-789");
      expect(result.properties.$user_id).toBe("user-789");
      expect(result.properties.session_id).toBe("mixpanel-session-789");
      expect(result.properties.langfuse_score_name).toBe("quality");
      expect(result.properties.langfuse_score_value).toBe(0.95);
    });
  });
});
