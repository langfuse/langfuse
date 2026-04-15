import { describe, expect, it } from "vitest";
import {
  compilePersistedEvalOutputDefinition,
  buildEvalOutputResultSchema,
  ChatMessageRole,
  ChatMessageType,
  createBooleanEvalOutputDefinition,
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
  PersistedEvalOutputDefinitionSchema,
  ScoreDataTypeEnum,
  validateEvalOutputResult,
} from "@langfuse/shared";
import { type ExtractedVariable } from "./observationEval/extractObservationVariables";
import {
  buildEvalExecutionMetadata,
  buildEvalMessages,
  compileEvalPrompt,
  getEnvironmentFromVariables,
} from "./evalRuntime";
import { buildEvalScoreWritePayloads, buildScoreEvent } from "./evalScoreEvent";

describe("evaluation helpers", () => {
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

  describe("buildEvalOutputResultSchema", () => {
    it("should build numeric response schema with descriptions", () => {
      const schema = buildEvalOutputResultSchema(
        createNumericEvalOutputDefinition({
          scoreDescription: "A number between 0 and 1 indicating accuracy",
          reasoningDescription: "Explanation of the score",
        }),
      );

      expect(schema.shape.score).toBeDefined();
      expect(schema.shape.reasoning).toBeDefined();
    });

    it("should validate correct response", () => {
      const schema = buildEvalOutputResultSchema(
        createNumericEvalOutputDefinition({
          scoreDescription: "Score between 0 and 1",
          reasoningDescription: "The reasoning",
        }),
      );
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
      const schema = buildEvalOutputResultSchema(
        createNumericEvalOutputDefinition({
          scoreDescription: "Score between 0 and 1",
          reasoningDescription: "The reasoning",
        }),
      );
      const result = schema.safeParse({
        reasoning: "Missing score",
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid response - string score", () => {
      const schema = buildEvalOutputResultSchema(
        createNumericEvalOutputDefinition({
          scoreDescription: "Score between 0 and 1",
          reasoningDescription: "The reasoning",
        }),
      );
      const result = schema.safeParse({
        score: "0.75",
        reasoning: "Score is string",
      });

      expect(result.success).toBe(false);
    });

    it("should validate boolean responses", () => {
      const schema = buildEvalOutputResultSchema(
        createBooleanEvalOutputDefinition({
          scoreDescription:
            "Return true if the answer is correct, otherwise false",
          reasoningDescription: "Explain the verdict",
        }),
      );

      expect(
        schema.safeParse({
          score: true,
          reasoning: "The answer satisfies the criteria.",
        }).success,
      ).toBe(true);
    });

    it("should reject string values for boolean responses", () => {
      const schema = buildEvalOutputResultSchema(
        createBooleanEvalOutputDefinition({
          scoreDescription:
            "Return true if the answer is correct, otherwise false",
          reasoningDescription: "Explain the verdict",
        }),
      );

      expect(
        schema.safeParse({
          score: "true",
          reasoning: "String booleans should be rejected.",
        }).success,
      ).toBe(false);
    });

    it("should validate categorical responses against allowed values", () => {
      const schema = buildEvalOutputResultSchema(
        createCategoricalEvalOutputDefinition({
          scoreDescription: "Choose the best matching category",
          reasoningDescription: "Explain the selected category",
          categories: ["correct", "partial"],
        }),
      );

      expect(
        schema.safeParse({
          score: "correct",
          reasoning: "The answer is fully supported.",
        }).success,
      ).toBe(true);

      expect(
        schema.safeParse({
          score: "incorrect",
          reasoning: "The answer is unsupported.",
        }).success,
      ).toBe(false);
    });

    it("should reject categorical arrays when only a single match is allowed", () => {
      const schema = buildEvalOutputResultSchema(
        createCategoricalEvalOutputDefinition({
          scoreDescription: "Choose the best matching category",
          reasoningDescription: "Explain the selected category",
          categories: ["correct", "partial"],
        }),
      );

      expect(
        schema.safeParse({
          score: ["correct", "partial"],
          reasoning: "This should fail because only one category is allowed.",
        }).success,
      ).toBe(false);
    });

    it("should validate categorical multi-match responses against allowed values", () => {
      const schema = buildEvalOutputResultSchema(
        createCategoricalEvalOutputDefinition({
          scoreDescription: "Choose all matching categories",
          reasoningDescription: "Explain the selected categories",
          categories: ["correct", "partial"],
          shouldAllowMultipleMatches: true,
        }),
      );

      expect(
        schema.safeParse({
          score: ["correct", "partial"],
          reasoning: "The answer is partly right and partly complete.",
        }).success,
      ).toBe(true);

      expect(
        schema.safeParse({
          score: ["correct", "correct"],
          reasoning: "Duplicate categories should be rejected.",
        }).success,
      ).toBe(false);
    });

    it("should reject duplicate categorical multi-match values", () => {
      const schema = buildEvalOutputResultSchema(
        createCategoricalEvalOutputDefinition({
          scoreDescription: "Choose all matching categories",
          reasoningDescription: "Explain the selected categories",
          categories: ["correct", "partial"],
          shouldAllowMultipleMatches: true,
        }),
      );

      expect(
        schema.safeParse({
          score: ["correct", "correct"],
          reasoning: "This should be invalid.",
        }).success,
      ).toBe(false);
    });

    it("should reject categorical scalars when multiple matches are required to be returned as an array", () => {
      const schema = buildEvalOutputResultSchema(
        createCategoricalEvalOutputDefinition({
          scoreDescription: "Choose all matching categories",
          reasoningDescription: "Explain the selected categories",
          categories: ["correct", "partial"],
          shouldAllowMultipleMatches: true,
        }),
      );

      expect(
        schema.safeParse({
          score: "correct",
          reasoning: "This should fail because multi-match uses an array.",
        }).success,
      ).toBe(false);
    });

    it("should reject empty categorical multi-match arrays", () => {
      const schema = buildEvalOutputResultSchema(
        createCategoricalEvalOutputDefinition({
          scoreDescription: "Choose all matching categories",
          reasoningDescription: "Explain the selected categories",
          categories: ["correct", "partial"],
          shouldAllowMultipleMatches: true,
        }),
      );

      expect(
        schema.safeParse({
          score: [],
          reasoning: "At least one category is required.",
        }).success,
      ).toBe(false);
    });
  });

  describe("buildEvalExecutionMetadata", () => {
    it("should include all provided fields", () => {
      const params = {
        jobExecutionId: "exec-123",
        jobConfigurationId: "config-456",
        targetTraceId: "trace-789",
        targetObservationId: "obs-abc",
        targetDatasetItemId: "dataset-def",
      };

      const result = buildEvalExecutionMetadata(params);

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

      const result = buildEvalExecutionMetadata(params);

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
        scoreValue: 0.85,
        reasoning: "High accuracy observed",
        environment: "production",
        executionTraceId: "exec-trace-abc",
        metadata: { job_execution_id: "exec-123" },
        dataType: ScoreDataTypeEnum.NUMERIC,
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
        scoreValue: 0.9,
        reasoning: "Highly relevant",
        environment: "default",
        executionTraceId: "exec-trace-def",
        metadata: {},
        dataType: ScoreDataTypeEnum.NUMERIC,
      };

      const result = buildScoreEvent(params);

      expect(result.body.observationId).toBe("obs-abc");
    });

    it("should build categorical score events", () => {
      const result = buildScoreEvent({
        eventId: "event-123",
        scoreId: "score-456",
        traceId: "trace-789",
        observationId: null,
        scoreName: "factuality",
        scoreValue: "correct",
        reasoning: "The answer is fully supported.",
        environment: "production",
        executionTraceId: "exec-trace-abc",
        metadata: { job_execution_id: "exec-123" },
        dataType: ScoreDataTypeEnum.CATEGORICAL,
      });

      expect(result.body.value).toBe("correct");
      expect(result.body.dataType).toBe("CATEGORICAL");
    });

    it("should build boolean score events", () => {
      const result = buildScoreEvent({
        eventId: "event-123",
        scoreId: "score-456",
        traceId: "trace-789",
        observationId: null,
        scoreName: "correctness",
        scoreValue: 1,
        reasoning: "The answer meets the criteria.",
        environment: "production",
        executionTraceId: "exec-trace-abc",
        metadata: { job_execution_id: "exec-123" },
        dataType: ScoreDataTypeEnum.BOOLEAN,
      });

      expect(result.body.value).toBe(1);
      expect(result.body.dataType).toBe("BOOLEAN");
    });
  });

  describe("buildEvalScoreWritePayloads", () => {
    it("should build a single numeric score payload", () => {
      const result = buildEvalScoreWritePayloads({
        outputResult: {
          dataType: ScoreDataTypeEnum.NUMERIC,
          score: 0.85,
          reasoning: "High accuracy observed",
        },
        primaryScoreId: "score-123",
        traceId: "trace-456",
        observationId: null,
        scoreName: "accuracy",
        environment: "production",
        executionTraceId: "exec-trace-789",
        metadata: { job_execution_id: "job-1" },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        eventId: expect.any(String),
        scoreId: "score-123",
        event: expect.objectContaining({
          body: expect.objectContaining({
            value: 0.85,
            dataType: ScoreDataTypeEnum.NUMERIC,
          }),
        }),
      });
    });

    it("should build a single boolean score payload", () => {
      const result = buildEvalScoreWritePayloads({
        outputResult: {
          dataType: ScoreDataTypeEnum.BOOLEAN,
          score: true,
          reasoning: "The answer satisfies the criteria",
        },
        primaryScoreId: "score-123",
        traceId: "trace-456",
        observationId: null,
        scoreName: "correctness",
        environment: "production",
        executionTraceId: "exec-trace-789",
        metadata: { job_execution_id: "job-1" },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        eventId: expect.any(String),
        scoreId: "score-123",
        event: expect.objectContaining({
          body: expect.objectContaining({
            value: 1,
            dataType: ScoreDataTypeEnum.BOOLEAN,
          }),
        }),
      });
    });

    it("should build one categorical payload per match while preserving shared metadata", () => {
      const result = buildEvalScoreWritePayloads({
        outputResult: {
          dataType: ScoreDataTypeEnum.CATEGORICAL,
          matches: ["correct", "partial"],
          reasoning: "Both categories apply",
        },
        primaryScoreId: "score-123",
        traceId: "trace-456",
        observationId: "obs-789",
        scoreName: "accuracy",
        environment: "production",
        executionTraceId: "exec-trace-789",
        metadata: { job_execution_id: "job-1" },
      });

      expect(result).toHaveLength(2);
      expect(result[0].scoreId).toBe("score-123");
      expect(result[1].scoreId).not.toBe("score-123");
      expect(result[0].event.body.value).toBe("correct");
      expect(result[1].event.body.value).toBe("partial");
      expect(result[0].event.body.comment).toBe("Both categories apply");
      expect(result[1].event.body.comment).toBe("Both categories apply");
      expect(result[0].event.body.metadata).toEqual({
        job_execution_id: "job-1",
      });
      expect(result[1].event.body.metadata).toEqual({
        job_execution_id: "job-1",
      });
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

  describe("validateEvalOutputResult", () => {
    it("should validate correct response", () => {
      const outputDefinition = createNumericEvalOutputDefinition({
        scoreDescription: "Score 0-1",
        reasoningDescription: "Why",
      });
      const result = validateEvalOutputResult({
        response: { score: 0.8, reasoning: "Good" },
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          dataType: ScoreDataTypeEnum.NUMERIC,
          score: 0.8,
          reasoning: "Good",
        });
      }
    });

    it("should return error for invalid response", () => {
      const outputDefinition = createNumericEvalOutputDefinition({
        scoreDescription: "Score 0-1",
        reasoningDescription: "Why",
      });

      const result = validateEvalOutputResult({
        response: { score: "invalid", reasoning: "Test" },
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should return error for null response", () => {
      const outputDefinition = createNumericEvalOutputDefinition({
        scoreDescription: "Score 0-1",
        reasoningDescription: "Why",
      });

      const result = validateEvalOutputResult({
        response: null,
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(false);
    });

    it("should return error for missing fields", () => {
      const outputDefinition = createNumericEvalOutputDefinition({
        scoreDescription: "Score 0-1",
        reasoningDescription: "Why",
      });

      const result = validateEvalOutputResult({
        response: { score: 0.5 },
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(false);
    });

    it("should normalize boolean responses", () => {
      const outputDefinition = createBooleanEvalOutputDefinition({
        scoreDescription:
          "Return true if the answer is correct, otherwise false",
        reasoningDescription: "Why",
      });

      const result = validateEvalOutputResult({
        response: { score: false, reasoning: "The answer is incorrect." },
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          dataType: ScoreDataTypeEnum.BOOLEAN,
          score: false,
          reasoning: "The answer is incorrect.",
        });
      }
    });

    it("should reject invalid boolean responses", () => {
      const outputDefinition = createBooleanEvalOutputDefinition({
        scoreDescription:
          "Return true if the answer is correct, otherwise false",
        reasoningDescription: "Why",
      });

      const result = validateEvalOutputResult({
        response: {
          score: "false",
          reasoning: "String booleans are invalid.",
        },
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(false);
    });

    it("should normalize categorical responses to a matches array", () => {
      const outputDefinition = createCategoricalEvalOutputDefinition({
        scoreDescription: "Choose the best matching category",
        reasoningDescription: "Why",
        categories: ["correct", "incorrect"],
      });

      const result = validateEvalOutputResult({
        response: { score: "correct", reasoning: "Supported by the context" },
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          dataType: ScoreDataTypeEnum.CATEGORICAL,
          matches: ["correct"],
          reasoning: "Supported by the context",
        });
      }
    });

    it("should validate categorical multi-match responses", () => {
      const outputDefinition = createCategoricalEvalOutputDefinition({
        scoreDescription: "Choose all matching categories",
        reasoningDescription: "Why",
        categories: ["correct", "incorrect"],
        shouldAllowMultipleMatches: true,
      });

      const result = validateEvalOutputResult({
        response: {
          score: ["correct", "incorrect"],
          reasoning: "Both labels apply in this synthetic test.",
        },
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          dataType: ScoreDataTypeEnum.CATEGORICAL,
          matches: ["correct", "incorrect"],
          reasoning: "Both labels apply in this synthetic test.",
        });
      }
    });

    it("should reject categorical responses with categories outside the allowed set", () => {
      const outputDefinition = createCategoricalEvalOutputDefinition({
        scoreDescription: "Choose the best matching category",
        reasoningDescription: "Why",
        categories: ["correct", "incorrect"],
      });

      const result = validateEvalOutputResult({
        response: { score: "partial", reasoning: "Not an allowed category" },
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(false);
    });

    it("should reject categorical multi-match responses with duplicate categories", () => {
      const outputDefinition = createCategoricalEvalOutputDefinition({
        scoreDescription: "Choose all matching categories",
        reasoningDescription: "Why",
        categories: ["correct", "incorrect"],
        shouldAllowMultipleMatches: true,
      });

      const result = validateEvalOutputResult({
        response: {
          score: ["correct", "correct"],
          reasoning: "Duplicates should be rejected.",
        },
        compiledOutputDefinition:
          compilePersistedEvalOutputDefinition(outputDefinition),
      });

      expect(result.success).toBe(false);
    });
  });

  describe("PersistedEvalOutputDefinitionSchema", () => {
    it("should validate correct output definition", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse({
        score: "A number between 0 and 1",
        reasoning: "Explanation of the score",
      });

      expect(result.success).toBe(true);
    });

    it("should default missing legacy score to an empty string", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse({
        reasoning: "Only reasoning",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score).toBe("");
      }
    });

    it("should default missing legacy reasoning to an empty string", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse({
        score: "Only score",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reasoning).toBe("");
      }
    });

    it("should reject non-string score", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse({
        score: 0.5,
        reasoning: "Explanation",
      });

      expect(result.success).toBe(false);
    });

    it("should accept versioned categorical schemas", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse(
        createCategoricalEvalOutputDefinition({
          scoreDescription: "Choose the best matching category",
          reasoningDescription: "Explain the selected category",
          categories: ["correct", "partial"],
        }),
      );

      expect(result.success).toBe(true);
    });

    it("should accept versioned boolean schemas", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse(
        createBooleanEvalOutputDefinition({
          scoreDescription:
            "Return true if the answer is correct, otherwise false",
          reasoningDescription: "Explain the verdict",
        }),
      );

      expect(result.success).toBe(true);
    });

    it("should accept versioned categorical multi-match schemas", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse(
        createCategoricalEvalOutputDefinition({
          scoreDescription: "Choose all matching categories",
          reasoningDescription: "Explain the selected categories",
          categories: ["correct", "partial"],
          shouldAllowMultipleMatches: true,
        }),
      );

      expect(result.success).toBe(true);
    });

    it("should default missing categorical multi-match flag to false", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse({
        version: 2,
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        reasoning: {
          description: "Explain the selected category",
        },
        score: {
          description: "Choose the best matching category",
          categories: ["correct", "partial"],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score.shouldAllowMultipleMatches).toBe(false);
      }
    });

    it("should reject categorical schemas with duplicate categories after trimming whitespace", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse({
        version: 2,
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        reasoning: {
          description: "Explain the selected category",
        },
        score: {
          description: "Choose the best matching category",
          categories: ["correct", " correct "],
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject categorical schemas with blank categories", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse({
        version: 2,
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        reasoning: {
          description: "Explain the selected category",
        },
        score: {
          description: "Choose the best matching category",
          categories: ["correct", "   "],
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject categorical schemas with fewer than two categories", () => {
      const result = PersistedEvalOutputDefinitionSchema.safeParse({
        version: 2,
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        reasoning: {
          description: "Explain the selected category",
        },
        score: {
          description: "Choose the best matching category",
          categories: ["correct"],
        },
      });

      expect(result.success).toBe(false);
    });
  });
});
