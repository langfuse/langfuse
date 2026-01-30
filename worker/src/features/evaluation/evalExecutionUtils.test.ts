import { describe, expect, it } from "vitest";
import {
  compileEvalPrompt,
  buildEvalScoreSchema,
  buildExecutionMetadata,
  buildEvalMessages,
  buildScoreEvent,
  getEnvironmentFromVariables,
  validateLLMResponse,
  evalTemplateOutputSchema,
} from "./evalExecutionUtils";
import { type ExtractedVariable } from "./evalService";
import { ChatMessageRole } from "@langfuse/shared";
import { ChatMessageType } from "@langfuse/shared/src/server";

describe("evalExecutionUtils", () => {
  describe("compileEvalPrompt", () => {
    it("should compile template with variables", () => {
      const params = {
        templatePrompt: "Evaluate {{input}} and compare to {{output}}",
        variables: [
          { var: "input", value: "user question" },
          { var: "output", value: "model response" },
        ] as ExtractedVariable[],
      };

      const result = compileEvalPrompt(params);
      expect(result).toBe(
        "Evaluate user question and compare to model response",
      );
    });

    it("should handle empty variables array", () => {
      const params = {
        templatePrompt: "Plain text without variables",
        variables: [] as ExtractedVariable[],
      };

      const result = compileEvalPrompt(params);
      expect(result).toBe("Plain text without variables");
    });

    it("should handle variables with special characters", () => {
      const params = {
        templatePrompt: "Input: {{input}}",
        variables: [
          { var: "input", value: "text with \"quotes\" and 'apostrophes'" },
        ] as ExtractedVariable[],
      };

      const result = compileEvalPrompt(params);
      expect(result).toBe("Input: text with \"quotes\" and 'apostrophes'");
    });

    it("should handle JSON values in variables", () => {
      const params = {
        templatePrompt: "Data: {{data}}",
        variables: [
          { var: "data", value: '{"key": "value", "count": 42}' },
        ] as ExtractedVariable[],
      };

      const result = compileEvalPrompt(params);
      expect(result).toBe('Data: {"key": "value", "count": 42}');
    });
  });

  describe("buildEvalScoreSchema", () => {
    it("should build schema with descriptions", () => {
      const outputSchema = {
        score: "A number between 0 and 1 indicating accuracy",
        reasoning: "Explanation of the score",
      };

      const schema = buildEvalScoreSchema(outputSchema);

      // Validate schema shape
      expect(schema.shape.score).toBeDefined();
      expect(schema.shape.reasoning).toBeDefined();
    });

    it("should validate correct response", () => {
      const outputSchema = {
        score: "Score between 0 and 1",
        reasoning: "The reasoning",
      };

      const schema = buildEvalScoreSchema(outputSchema);
      const result = schema.safeParse({
        score: 0.75,
        reasoning: "Good accuracy overall",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score).toBe(0.75);
        expect(result.data.reasoning).toBe("Good accuracy overall");
      }
    });

    it("should reject invalid response - missing score", () => {
      const outputSchema = {
        score: "Score between 0 and 1",
        reasoning: "The reasoning",
      };

      const schema = buildEvalScoreSchema(outputSchema);
      const result = schema.safeParse({
        reasoning: "Missing score",
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid response - string score", () => {
      const outputSchema = {
        score: "Score between 0 and 1",
        reasoning: "The reasoning",
      };

      const schema = buildEvalScoreSchema(outputSchema);
      const result = schema.safeParse({
        score: "0.75",
        reasoning: "Score is string",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("buildExecutionMetadata", () => {
    it("should include all provided fields", () => {
      const params = {
        jobExecutionId: "exec-123",
        jobConfigurationId: "config-456",
        targetTraceId: "trace-789",
        targetObservationId: "obs-abc",
        targetDatasetItemId: "dataset-def",
      };

      const result = buildExecutionMetadata(params);

      expect(result).toEqual({
        job_execution_id: "exec-123",
        job_configuration_id: "config-456",
        target_trace_id: "trace-789",
        target_observation_id: "obs-abc",
        target_dataset_item_id: "dataset-def",
      });
    });

    it("should exclude null/undefined fields", () => {
      const params = {
        jobExecutionId: "exec-123",
        jobConfigurationId: "config-456",
        targetTraceId: null,
        targetObservationId: undefined,
        targetDatasetItemId: null,
      };

      const result = buildExecutionMetadata(params);

      expect(result).toEqual({
        job_execution_id: "exec-123",
        job_configuration_id: "config-456",
      });
      expect(Object.keys(result)).not.toContain("target_trace_id");
      expect(Object.keys(result)).not.toContain("target_observation_id");
      expect(Object.keys(result)).not.toContain("target_dataset_item_id");
    });
  });

  describe("buildEvalMessages", () => {
    it("should build user message array", () => {
      const prompt = "Evaluate this response";

      const result = buildEvalMessages(prompt);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: ChatMessageType.User,
        role: ChatMessageRole.User,
        content: "Evaluate this response",
      });
    });

    it("should handle multiline prompts", () => {
      const prompt = "First line\nSecond line\nThird line";

      const result = buildEvalMessages(prompt);

      expect(result[0].content).toBe("First line\nSecond line\nThird line");
    });
  });

  describe("buildScoreEvent", () => {
    it("should build complete score event", () => {
      const params = {
        eventId: "event-123",
        scoreId: "score-456",
        traceId: "trace-789",
        observationId: null,
        scoreName: "accuracy",
        value: 0.85,
        reasoning: "High accuracy observed",
        environment: "production",
        executionTraceId: "exec-trace-abc",
        metadata: { job_execution_id: "exec-123" },
      };

      const result = buildScoreEvent(params);

      expect(result.id).toBe("event-123");
      expect(result.type).toBe("score-create");
      expect(result.body.id).toBe("score-456");
      expect(result.body.traceId).toBe("trace-789");
      expect(result.body.observationId).toBeNull();
      expect(result.body.name).toBe("accuracy");
      expect(result.body.value).toBe(0.85);
      expect(result.body.comment).toBe("High accuracy observed");
      expect(result.body.source).toBe("EVAL");
      expect(result.body.environment).toBe("production");
      expect(result.body.executionTraceId).toBe("exec-trace-abc");
      expect(result.body.metadata).toEqual({ job_execution_id: "exec-123" });
      expect(result.body.dataType).toBe("NUMERIC");
    });

    it("should include observation ID when provided", () => {
      const params = {
        eventId: "event-123",
        scoreId: "score-456",
        traceId: "trace-789",
        observationId: "obs-abc",
        scoreName: "relevance",
        value: 0.9,
        reasoning: "Highly relevant",
        environment: "default",
        executionTraceId: "exec-trace-def",
        metadata: {},
      };

      const result = buildScoreEvent(params);

      expect(result.body.observationId).toBe("obs-abc");
    });
  });

  describe("getEnvironmentFromVariables", () => {
    it("should return environment from variable that has it", () => {
      const variables: ExtractedVariable[] = [
        { var: "input", value: "test" },
        { var: "output", value: "result", environment: "production" },
        { var: "context", value: "extra" },
      ];

      const result = getEnvironmentFromVariables(variables);

      expect(result).toBe("production");
    });

    it("should return first environment when multiple exist", () => {
      const variables: ExtractedVariable[] = [
        { var: "input", value: "test", environment: "staging" },
        { var: "output", value: "result", environment: "production" },
      ];

      const result = getEnvironmentFromVariables(variables);

      expect(result).toBe("staging");
    });

    it("should return undefined when no environment exists", () => {
      const variables: ExtractedVariable[] = [
        { var: "input", value: "test" },
        { var: "output", value: "result" },
      ];

      const result = getEnvironmentFromVariables(variables);

      expect(result).toBeUndefined();
    });

    it("should return undefined for empty array", () => {
      const result = getEnvironmentFromVariables([]);

      expect(result).toBeUndefined();
    });
  });

  describe("validateLLMResponse", () => {
    it("should validate correct response", () => {
      const schema = buildEvalScoreSchema({
        score: "Score 0-1",
        reasoning: "Why",
      });

      const result = validateLLMResponse({
        response: { score: 0.8, reasoning: "Good" },
        schema,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score).toBe(0.8);
        expect(result.data.reasoning).toBe("Good");
      }
    });

    it("should return error for invalid response", () => {
      const schema = buildEvalScoreSchema({
        score: "Score 0-1",
        reasoning: "Why",
      });

      const result = validateLLMResponse({
        response: { score: "invalid", reasoning: "Test" },
        schema,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should return error for null response", () => {
      const schema = buildEvalScoreSchema({
        score: "Score 0-1",
        reasoning: "Why",
      });

      const result = validateLLMResponse({
        response: null,
        schema,
      });

      expect(result.success).toBe(false);
    });

    it("should return error for missing fields", () => {
      const schema = buildEvalScoreSchema({
        score: "Score 0-1",
        reasoning: "Why",
      });

      const result = validateLLMResponse({
        response: { score: 0.5 },
        schema,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("evalTemplateOutputSchema", () => {
    it("should validate correct output schema", () => {
      const result = evalTemplateOutputSchema.safeParse({
        score: "A number between 0 and 1",
        reasoning: "Explanation of the score",
      });

      expect(result.success).toBe(true);
    });

    it("should reject schema missing score", () => {
      const result = evalTemplateOutputSchema.safeParse({
        reasoning: "Only reasoning",
      });

      expect(result.success).toBe(false);
    });

    it("should reject schema missing reasoning", () => {
      const result = evalTemplateOutputSchema.safeParse({
        score: "Only score",
      });

      expect(result.success).toBe(false);
    });

    it("should reject non-string score", () => {
      const result = evalTemplateOutputSchema.safeParse({
        score: 0.5,
        reasoning: "Explanation",
      });

      expect(result.success).toBe(false);
    });
  });
});
