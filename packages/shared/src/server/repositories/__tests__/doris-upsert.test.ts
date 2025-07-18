import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { 
  upsertDoris, 
  upsertDorisScore, 
  upsertDorisTrace, 
  upsertDorisObservation,
  batchUpsertDoris 
} from "../doris";
import { dorisClient } from "../../doris/client";

describe("Doris Upsert Operations", () => {
  const testProjectId = "test-project-upsert";
  const testTraceId = "test-trace-upsert";
  const testObservationId = "test-observation-upsert";
  const testScoreId = "test-score-upsert";

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData();
  });

  async function cleanupTestData() {
    const client = dorisClient();
    try {
      await client.query(`DELETE FROM traces WHERE project_id = '${testProjectId}'`);
      await client.query(`DELETE FROM observations WHERE project_id = '${testProjectId}'`);
      await client.query(`DELETE FROM scores WHERE project_id = '${testProjectId}'`);
    } catch (error) {
      // Ignore cleanup errors
      console.warn("Cleanup error:", error);
    }
  }

  describe("upsertDorisTrace", () => {
    it("should insert a new trace", async () => {
      const trace = {
        id: testTraceId,
        project_id: testProjectId,
        timestamp: new Date(),
        name: "Test Trace",
        user_id: "test-user",
        metadata: { test: "value" },
        public: true,
        bookmarked: false,
        tags: ["test"],
        input: "test input",
        output: "test output",
        session_id: "test-session",
        created_at: new Date(),
        updated_at: new Date(),
        event_ts: new Date(),
        is_deleted: 0,
      };

      await upsertDorisTrace(trace);

      // Verify the trace was inserted
      const client = dorisClient();
      const result = await client.query(
        `SELECT * FROM traces WHERE project_id = '${testProjectId}' AND id = '${testTraceId}'`
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Trace");
      expect(result[0].user_id).toBe("test-user");
    });

    it("should update an existing trace", async () => {
      const originalTrace = {
        id: testTraceId,
        project_id: testProjectId,
        timestamp: new Date(),
        name: "Original Trace",
        user_id: "original-user",
        metadata: { original: "value" },
        public: false,
        bookmarked: false,
        tags: ["original"],
        input: "original input",
        output: "original output",
        session_id: "original-session",
        created_at: new Date(),
        updated_at: new Date(),
        event_ts: new Date(),
        is_deleted: 0,
      };

      // Insert original trace
      await upsertDorisTrace(originalTrace);

      // Update the trace
      const updatedTrace = {
        ...originalTrace,
        name: "Updated Trace",
        user_id: "updated-user",
        public: true,
        updated_at: new Date(),
      };

      await upsertDorisTrace(updatedTrace);

      // Verify the trace was updated
      const client = dorisClient();
      const result = await client.query(
        `SELECT * FROM traces WHERE project_id = '${testProjectId}' AND id = '${testTraceId}'`
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Updated Trace");
      expect(result[0].user_id).toBe("updated-user");
      expect(result[0].public).toBe(1); // Boolean true becomes 1 in Doris
    });
  });

  describe("upsertDorisScore", () => {
    it("should insert a new score", async () => {
      const score = {
        id: testScoreId,
        project_id: testProjectId,
        name: "test-score",
        timestamp: new Date(),
        trace_id: testTraceId,
        observation_id: testObservationId,
        value: 0.95,
        source: "API",
        comment: "Test score",
        author_user_id: "test-user",
        config_id: "test-config",
        data_type: "NUMERIC",
        string_value: null,
        queue_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        event_ts: new Date(),
        is_deleted: 0,
      };

      await upsertDorisScore(score);

      // Verify the score was inserted
      const client = dorisClient();
      const result = await client.query(
        `SELECT * FROM scores WHERE project_id = '${testProjectId}' AND id = '${testScoreId}'`
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("test-score");
      expect(result[0].value).toBe(0.95);
      expect(result[0].source).toBe("API");
    });

    it("should update an existing score", async () => {
      const originalScore = {
        id: testScoreId,
        project_id: testProjectId,
        name: "test-score",
        timestamp: new Date(),
        trace_id: testTraceId,
        observation_id: testObservationId,
        value: 0.5,
        source: "API",
        comment: "Original score",
        author_user_id: "test-user",
        config_id: "test-config",
        data_type: "NUMERIC",
        string_value: null,
        queue_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        event_ts: new Date(),
        is_deleted: 0,
      };

      // Insert original score
      await upsertDorisScore(originalScore);

      // Update the score
      const updatedScore = {
        ...originalScore,
        value: 0.95,
        comment: "Updated score",
        updated_at: new Date(),
      };

      await upsertDorisScore(updatedScore);

      // Verify the score was updated
      const client = dorisClient();
      const result = await client.query(
        `SELECT * FROM scores WHERE project_id = '${testProjectId}' AND id = '${testScoreId}'`
      );

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(0.95);
      expect(result[0].comment).toBe("Updated score");
    });
  });

  describe("batchUpsertDoris", () => {
    it("should handle batch upsert of multiple records", async () => {
      const scores = Array.from({ length: 5 }, (_, i) => ({
        id: `${testScoreId}-${i}`,
        project_id: testProjectId,
        name: `test-score-${i}`,
        timestamp: new Date(),
        trace_id: `${testTraceId}-${i}`,
        observation_id: null,
        value: 0.1 * (i + 1),
        source: "API",
        comment: `Test score ${i}`,
        author_user_id: "test-user",
        config_id: "test-config",
        data_type: "NUMERIC",
        string_value: null,
        queue_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        event_ts: new Date(),
        is_deleted: 0,
      }));

      await batchUpsertDoris({
        table: "scores",
        records: scores,
        batchSize: 2, // Test batching with small batch size
      });

      // Verify all scores were inserted
      const client = dorisClient();
      const result = await client.query(
        `SELECT * FROM scores WHERE project_id = '${testProjectId}' ORDER BY name`
      );

      expect(result).toHaveLength(5);
      expect(result[0].name).toBe("test-score-0");
      expect(result[4].name).toBe("test-score-4");
      expect(result[0].value).toBe(0.1);
      expect(result[4].value).toBe(0.5);
    });
  });

  describe("error handling", () => {
    it("should throw error when required fields are missing", async () => {
      const incompleteTrace = {
        project_id: testProjectId,
        name: "Incomplete Trace",
        // Missing required 'id' and 'timestamp' fields
      };

      await expect(upsertDorisTrace(incompleteTrace)).rejects.toThrow(
        "Identifier fields must be provided to upsert Trace in Doris."
      );
    });

    it("should throw error when score required fields are missing", async () => {
      const incompleteScore = {
        project_id: testProjectId,
        value: 0.95,
        // Missing required 'id', 'name', and 'timestamp' fields
      };

      await expect(upsertDorisScore(incompleteScore)).rejects.toThrow(
        "Identifier fields must be provided to upsert Score in Doris."
      );
    });
  });
}); 