import { convertToScore } from "@langfuse/shared/src/server/repositories/scores_converters";
import { type ScoreRecordReadType } from "@langfuse/shared/src/server/repositories/definitions";
import { type ScoreDomain } from "@langfuse/shared";
import { v4 } from "uuid";

describe("Score Converters - Discriminated Union", () => {
  const baseScoreRecord = {
    id: v4(),
    project_id: v4(),
    trace_id: v4(),
    session_id: null,
    observation_id: null,
    dataset_run_id: null,
    environment: "production",
    name: "test-score",
    source: "API" as const,
    comment: "Test comment",
    metadata: { key: "value" },
    author_user_id: v4(),
    config_id: v4(),
    queue_id: null,
    execution_trace_id: null,
    is_deleted: 0,
    created_at: "2024-01-01 12:00:00.000000",
    updated_at: "2024-01-01 12:00:00.000000",
    timestamp: "2024-01-01 12:00:00.000000",
    event_ts: "2024-01-01 12:00:00.000000",
  };

  describe("NUMERIC score conversion", () => {
    it("should convert NUMERIC score with value", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 0.95,
        string_value: null,
      };

      const result = convertToScore(record);

      expect(result.dataType).toBe("NUMERIC");
      expect(result.value).toBe(0.95);
      expect(result.stringValue).toBeNull();
      expect(result.id).toBe(record.id);
      expect(result.projectId).toBe(record.project_id);
      expect(result.name).toBe(record.name);
      expect(result.source).toBe(record.source);
    });

    it("should convert NUMERIC score with null value", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: null,
        string_value: null,
      };

      const result = convertToScore(record);

      expect(result.dataType).toBe("NUMERIC");
      expect(result.value).toBeNull();
      expect(result.stringValue).toBeNull();
    });

    it("should convert NUMERIC score with integer value", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 100,
        string_value: null,
      };

      const result = convertToScore(record);

      expect(result.dataType).toBe("NUMERIC");
      expect(result.value).toBe(100);
    });
  });

  describe("CATEGORICAL score conversion", () => {
    it("should convert CATEGORICAL score with string value", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "CATEGORICAL",
        value: 1,
        string_value: "excellent",
      };

      const result = convertToScore(record);

      expect(result.dataType).toBe("CATEGORICAL");
      expect(result.stringValue).toBe("excellent");
      expect(result.value).toBe(1);
    });

    it("should convert CATEGORICAL score with only string value", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "CATEGORICAL",
        value: null,
        string_value: "poor",
      };

      const result = convertToScore(record);

      expect(result.dataType).toBe("CATEGORICAL");
      expect(result.stringValue).toBe("poor");
      expect(result.value).toBeNull();
    });
  });

  describe("BOOLEAN score conversion", () => {
    it("should convert BOOLEAN score with true value", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "BOOLEAN",
        value: 1,
        string_value: "true",
      };

      const result = convertToScore(record);

      expect(result.dataType).toBe("BOOLEAN");
      expect(result.value).toBe(1);
      expect(result.stringValue).toBe("true");
    });

    it("should convert BOOLEAN score with false value", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "BOOLEAN",
        value: 0,
        string_value: "false",
      };

      const result = convertToScore(record);

      expect(result.dataType).toBe("BOOLEAN");
      expect(result.value).toBe(0);
      expect(result.stringValue).toBe("false");
    });
  });

  describe("Default to NUMERIC when data_type is null", () => {
    it("should default to NUMERIC when data_type is null", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: null,
        value: 0.75,
        string_value: null,
      };

      const result = convertToScore(record);

      expect(result.dataType).toBe("NUMERIC");
      expect(result.value).toBe(0.75);
    });
  });

  describe("Date conversion", () => {
    it("should convert timestamp strings to Date objects", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 1.0,
        string_value: null,
      };

      const result = convertToScore(record);

      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("Metadata conversion", () => {
    it("should convert metadata from ClickHouse record format", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 1.0,
        string_value: null,
        metadata: {
          modelName: "gpt-4",
          temperature: "0.7",
          userId: "user-123",
        },
      };

      const result = convertToScore(record);

      expect(result.metadata).toBeDefined();
      expect(typeof result.metadata).toBe("object");
    });

    it("should handle empty metadata", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 1.0,
        string_value: null,
        metadata: {},
      };

      const result = convertToScore(record);

      expect(result.metadata).toBeDefined();
    });
  });

  describe("Null field handling", () => {
    it("should handle all nullable fields correctly", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 0.5,
        string_value: null,
        trace_id: null,
        session_id: null,
        observation_id: null,
        dataset_run_id: null,
        comment: null,
        author_user_id: null,
        config_id: null,
        queue_id: null,
        execution_trace_id: null,
      };

      const result = convertToScore(record);

      expect(result.traceId).toBeNull();
      expect(result.sessionId).toBeNull();
      expect(result.observationId).toBeNull();
      expect(result.datasetRunId).toBeNull();
      expect(result.comment).toBeNull();
      expect(result.authorUserId).toBeNull();
      expect(result.configId).toBeNull();
      expect(result.queueId).toBeNull();
      expect(result.executionTraceId).toBeNull();
    });
  });

  describe("Score types for different entities", () => {
    it("should convert trace-level score", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 0.9,
        string_value: null,
        trace_id: v4(),
        observation_id: null,
        session_id: null,
        dataset_run_id: null,
      };

      const result = convertToScore(record);

      expect(result.traceId).not.toBeNull();
      expect(result.observationId).toBeNull();
      expect(result.sessionId).toBeNull();
      expect(result.datasetRunId).toBeNull();
    });

    it("should convert observation-level score", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "CATEGORICAL",
        value: 1,
        string_value: "good",
        trace_id: v4(),
        observation_id: v4(),
        session_id: null,
        dataset_run_id: null,
      };

      const result = convertToScore(record);

      expect(result.traceId).not.toBeNull();
      expect(result.observationId).not.toBeNull();
      expect(result.sessionId).toBeNull();
      expect(result.datasetRunId).toBeNull();
    });

    it("should convert session-level score", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "BOOLEAN",
        value: 1,
        string_value: "true",
        trace_id: null,
        observation_id: null,
        session_id: v4(),
        dataset_run_id: null,
      };

      const result = convertToScore(record);

      expect(result.traceId).toBeNull();
      expect(result.observationId).toBeNull();
      expect(result.sessionId).not.toBeNull();
      expect(result.datasetRunId).toBeNull();
    });

    it("should convert dataset run score", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 0.85,
        string_value: null,
        trace_id: null,
        observation_id: null,
        session_id: null,
        dataset_run_id: v4(),
      };

      const result = convertToScore(record);

      expect(result.traceId).toBeNull();
      expect(result.observationId).toBeNull();
      expect(result.sessionId).toBeNull();
      expect(result.datasetRunId).not.toBeNull();
    });
  });

  describe("Score sources", () => {
    it("should convert API source score", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 1.0,
        string_value: null,
        source: "API",
      };

      const result = convertToScore(record);

      expect(result.source).toBe("API");
    });

    it("should convert EVAL source score", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "CATEGORICAL",
        value: 1,
        string_value: "pass",
        source: "EVAL",
      };

      const result = convertToScore(record);

      expect(result.source).toBe("EVAL");
    });

    it("should convert ANNOTATION source score", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "BOOLEAN",
        value: 1,
        string_value: "true",
        source: "ANNOTATION",
      };

      const result = convertToScore(record);

      expect(result.source).toBe("ANNOTATION");
    });
  });

  describe("Type safety", () => {
    it("should produce a valid ScoreDomain object", () => {
      const record: ScoreRecordReadType = {
        ...baseScoreRecord,
        data_type: "NUMERIC",
        value: 0.95,
        string_value: null,
      };

      const result: ScoreDomain = convertToScore(record);

      // Type assertion - if this compiles, the types are correct
      expect(result.id).toBeDefined();
      expect(result.projectId).toBeDefined();
      expect(result.dataType).toBeDefined();
      expect(result.source).toBeDefined();
    });
  });
});
