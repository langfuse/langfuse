import { describe, it, expect } from "vitest";
import {
  transformTraceForPostHog,
  transformGenerationForPostHog,
  transformScoreForPostHog,
  transformEventForPostHog,
} from "../features/posthog/transformers";
import type {
  AnalyticsTraceEvent,
  AnalyticsGenerationEvent,
  AnalyticsScoreEvent,
  AnalyticsObservationEvent,
} from "@langfuse/shared/src/server";

describe("PostHog transformers", () => {
  const projectId = "test-project-id";

  describe("transformEventForPostHog", () => {
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

      const result = transformEventForPostHog(event, projectId);

      expect(result.event).toBe("langfuse observation");
      expect(result.distinctId).toBe("user-789");
      expect(result.timestamp).toEqual(new Date("2024-01-15T10:00:00Z"));
      expect(result.uuid).toBeDefined();
      expect(result.properties.$session_id).toBe("posthog-session-123");
      expect(result.properties.langfuse_observation_name).toBe("test-event");
      expect(result.properties.langfuse_trace_name).toBe("test-trace");
      expect(result.properties.langfuse_model).toBe("gpt-4");
      expect(result.properties.langfuse_type).toBe("GENERATION");
      expect(result.properties.$set).toEqual({
        langfuse_user_url: "https://langfuse.com/project/test/users/user-789",
      });
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

      const result = transformEventForPostHog(event, projectId);

      expect(result.event).toBe("langfuse observation");
      // distinctId should be the generated UUID when no user_id
      expect(result.distinctId).toBe(result.uuid);
      expect(result.properties.$session_id).toBeNull();
      // Should have $process_person_profile: false for anonymous events
      expect(result.properties.$process_person_profile).toBe(false);
      expect(result.properties.$set).toBeUndefined();
    });

    it("should generate consistent UUIDs for the same event", () => {
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

      const result1 = transformEventForPostHog(event, projectId);
      const result2 = transformEventForPostHog(event, projectId);

      expect(result1.uuid).toBe(result2.uuid);
    });

    it("should handle event with session_id but no user_id", () => {
      const event: AnalyticsObservationEvent = {
        langfuse_id: "event-with-session",
        timestamp: new Date("2024-01-15T10:00:00Z"),
        langfuse_observation_name: "session-event",
        langfuse_session_id: "session-123",
        langfuse_project_id: projectId,
        langfuse_user_id: null,
        langfuse_event_version: "1.0.0",
        posthog_session_id: "posthog-session-abc",
        mixpanel_session_id: null,
      };

      const result = transformEventForPostHog(event, projectId);

      expect(result.properties.$session_id).toBe("posthog-session-abc");
      expect(result.properties.langfuse_session_id).toBe("session-123");
      expect(result.properties.$process_person_profile).toBe(false);
    });
  });

  describe("transformTraceForPostHog", () => {
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
        posthog_session_id: "posthog-session-123",
        mixpanel_session_id: null,
      };

      const result = transformTraceForPostHog(trace, projectId);

      expect(result.event).toBe("langfuse trace");
      expect(result.distinctId).toBe("user-789");
      expect(result.properties.$session_id).toBe("posthog-session-123");
    });
  });

  describe("transformGenerationForPostHog", () => {
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
        posthog_session_id: "posthog-session-456",
        mixpanel_session_id: null,
      };

      const result = transformGenerationForPostHog(generation, projectId);

      expect(result.event).toBe("langfuse generation");
      expect(result.distinctId).toBe("user-789");
      expect(result.properties.$session_id).toBe("posthog-session-456");
      expect(result.properties.langfuse_model).toBe("gpt-4-turbo");
    });
  });

  describe("transformScoreForPostHog", () => {
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
        posthog_session_id: "posthog-session-789",
        mixpanel_session_id: null,
      };

      const result = transformScoreForPostHog(score, projectId);

      expect(result.event).toBe("langfuse score");
      expect(result.distinctId).toBe("user-789");
      expect(result.properties.$session_id).toBe("posthog-session-789");
      expect(result.properties.langfuse_score_name).toBe("quality");
      expect(result.properties.langfuse_score_value).toBe(0.95);
    });

    it("truncates oversized metadata so PostHog capture accepts the event", () => {
      const nested = JSON.stringify(
        Array.from({ length: 6_000 }, (_, i) => ({
          rule: `rule-${i}`,
          findings: [{ path: "a/b/c.ts", line: i, ok: false }],
        })),
      );
      expect(nested.length).toBeGreaterThan(400_000);
      const score: AnalyticsScoreEvent = {
        langfuse_id: "score-big",
        timestamp: new Date("2026-10-24T17:57:18Z"),
        langfuse_score_name: "origin_tag_lint",
        langfuse_score_comment: "kept",
        langfuse_score_metadata: { report: nested, again: nested },
        langfuse_score_string_value: null,
      };

      const result = transformScoreForPostHog(score, projectId);

      // PostHog capture re-encodes the event into a 1,000,000-byte Kafka message.
      const kafkaData = JSON.stringify(JSON.stringify(result));
      expect(Buffer.byteLength(kafkaData)).toBeLessThan(1_000_000);
      const metadata = result.properties.langfuse_score_metadata as Record<
        string,
        string
      >;
      expect(metadata.report.endsWith("…[truncated]")).toBe(true);
      expect(nested.startsWith(metadata.report.slice(0, -12))).toBe(true);
      expect(metadata.again).toBe(nested);
      expect(result.properties.langfuse_score_truncated_fields).toEqual([
        "langfuse_score_metadata.report",
      ]);
      expect(result.properties.langfuse_score_comment).toBe("kept");
    });

    it("counts the rest of the score towards the PostHog limit", () => {
      const score: AnalyticsScoreEvent = {
        langfuse_id: "score-tags",
        timestamp: new Date("2026-10-24T17:57:18Z"),
        langfuse_score_comment: "c".repeat(850_000),
        langfuse_tags: Array.from({ length: 16_000 }, (_, i) => `tag-${i}`),
      };

      const result = transformScoreForPostHog(score, projectId);

      const kafkaData = JSON.stringify(JSON.stringify(result));
      expect(Buffer.byteLength(kafkaData)).toBeLessThan(1_000_000);
      expect(result.properties.langfuse_score_truncated_fields).toEqual([
        "langfuse_score_comment",
      ]);
      expect(result.properties.langfuse_score_comment).toMatch(
        /^c+…\[truncated]$/,
      );
    });

    it("keeps as much of the string as fits when its tail escapes heavily", () => {
      const score: AnalyticsScoreEvent = {
        langfuse_id: "score-uneven",
        timestamp: new Date("2026-10-24T17:57:18Z"),
        langfuse_score_comment: "a".repeat(500_000) + '"'.repeat(200_000),
      };

      const result = transformScoreForPostHog(score, projectId);

      const kafkaData = JSON.stringify(JSON.stringify(result));
      expect(Buffer.byteLength(kafkaData)).toBeLessThan(1_000_000);
      // ~95K quotes (4 bytes each after two encodings) still fit the budget.
      const comment = result.properties.langfuse_score_comment as string;
      expect(comment.split('"').length - 1).toBeGreaterThan(90_000);
    });

    it("drops metadata whose keys alone exceed the PostHog limit", () => {
      const comment = "c".repeat(200_000);
      const score: AnalyticsScoreEvent = {
        langfuse_id: "score-keys",
        timestamp: new Date("2026-10-24T17:57:18Z"),
        langfuse_score_comment: comment,
        langfuse_score_metadata: Object.fromEntries(
          Array.from({ length: 40_000 }, (_, i) => [
            `key-${i}`,
            "v".repeat(20),
          ]),
        ),
      };

      const result = transformScoreForPostHog(score, projectId);

      const kafkaData = JSON.stringify(JSON.stringify(result));
      expect(Buffer.byteLength(kafkaData)).toBeLessThan(1_000_000);
      expect(result.properties.langfuse_score_metadata).toBeNull();
      expect(result.properties.langfuse_score_omitted_fields).toEqual([
        "langfuse_score_metadata",
      ]);
      // Fits once metadata is gone, so it must not stay cut.
      expect(result.properties.langfuse_score_comment).toBe(comment);
      expect(result.properties.langfuse_score_truncated_fields).toBeUndefined();
    });

    it("keeps metadata when hundreds of truncated values fit", () => {
      const score: AnalyticsScoreEvent = {
        langfuse_id: "score-many-cuts",
        timestamp: new Date("2026-10-24T17:57:18Z"),
        langfuse_score_metadata: Object.fromEntries(
          Array.from({ length: 500 }, (_, i) => [
            `metadata_entry_key_${i}`,
            '"'.repeat(2_000),
          ]),
        ),
      };

      const result = transformScoreForPostHog(score, projectId);

      const kafkaData = JSON.stringify(JSON.stringify(result));
      expect(Buffer.byteLength(kafkaData)).toBeLessThan(1_000_000);
      expect(result.properties.langfuse_score_omitted_fields).toBeUndefined();
      expect(
        Object.keys(result.properties.langfuse_score_metadata as object),
      ).toHaveLength(500);
    });
  });
});
