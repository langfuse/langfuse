import { ScoreSchema } from "@langfuse/shared/src/domain/scores";
import { v4 } from "uuid";

describe("Score Schema - Discriminated Union Validation", () => {
  const baseScore = {
    id: v4(),
    timestamp: new Date(),
    projectId: v4(),
    environment: "production",
    name: "test-score",
    source: "API" as const,
    authorUserId: v4(),
    comment: "Test comment",
    metadata: { key: "value" },
    configId: v4(),
    createdAt: new Date(),
    updatedAt: new Date(),
    queueId: null,
    executionTraceId: null,
    traceId: v4(),
    observationId: null,
    sessionId: null,
    datasetRunId: null,
  };

  describe("NUMERIC score validation", () => {
    it("should validate NUMERIC score with value", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 0.95,
        stringValue: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dataType).toBe("NUMERIC");
        expect(result.data.value).toBe(0.95);
      }
    });

    it("should validate NUMERIC score with null value", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: null,
        stringValue: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should reject NUMERIC score with stringValue", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 0.95,
        stringValue: "invalid",
      };

      const result = ScoreSchema.safeParse(score);

      // The discriminated union requires stringValue to be undefined or null for NUMERIC
      expect(result.success).toBe(false);
    });

    it("should accept NUMERIC score with integer value", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 100,
        stringValue: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.value).toBe(100);
      }
    });

    it("should accept NUMERIC score with negative value", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: -50,
        stringValue: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should accept NUMERIC score with decimal value", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 0.123456789,
        stringValue: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });
  });

  describe("CATEGORICAL score validation", () => {
    it("should validate CATEGORICAL score with stringValue", () => {
      const score = {
        ...baseScore,
        dataType: "CATEGORICAL" as const,
        value: 1,
        stringValue: "excellent",
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dataType).toBe("CATEGORICAL");
        expect(result.data.stringValue).toBe("excellent");
      }
    });

    it("should validate CATEGORICAL score with only stringValue", () => {
      const score = {
        ...baseScore,
        dataType: "CATEGORICAL" as const,
        value: null,
        stringValue: "poor",
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stringValue).toBe("poor");
        expect(result.data.value).toBeNull();
      }
    });

    it("should reject CATEGORICAL score without stringValue", () => {
      const score = {
        ...baseScore,
        dataType: "CATEGORICAL" as const,
        value: 1,
        stringValue: null,
      };

      const result = ScoreSchema.safeParse(score);

      // CATEGORICAL requires stringValue to be a non-null string
      expect(result.success).toBe(false);
    });

    it("should accept CATEGORICAL score with empty string", () => {
      const score = {
        ...baseScore,
        dataType: "CATEGORICAL" as const,
        value: 0,
        stringValue: "",
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should accept CATEGORICAL score with multi-word categories", () => {
      const score = {
        ...baseScore,
        dataType: "CATEGORICAL" as const,
        value: 2,
        stringValue: "needs improvement",
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });
  });

  describe("BOOLEAN score validation", () => {
    it("should validate BOOLEAN score with value 1 (true)", () => {
      const score = {
        ...baseScore,
        dataType: "BOOLEAN" as const,
        value: 1,
        stringValue: "true",
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dataType).toBe("BOOLEAN");
        expect(result.data.value).toBe(1);
        expect(result.data.stringValue).toBe("true");
      }
    });

    it("should validate BOOLEAN score with value 0 (false)", () => {
      const score = {
        ...baseScore,
        dataType: "BOOLEAN" as const,
        value: 0,
        stringValue: "false",
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.value).toBe(0);
        expect(result.data.stringValue).toBe("false");
      }
    });

    it("should reject BOOLEAN score without stringValue", () => {
      const score = {
        ...baseScore,
        dataType: "BOOLEAN" as const,
        value: 1,
        stringValue: null,
      };

      const result = ScoreSchema.safeParse(score);

      // BOOLEAN requires both value and stringValue
      expect(result.success).toBe(false);
    });

    it("should reject BOOLEAN score without value", () => {
      const score = {
        ...baseScore,
        dataType: "BOOLEAN" as const,
        value: null,
        stringValue: "true",
      };

      const result = ScoreSchema.safeParse(score);

      // BOOLEAN requires value to be a number
      expect(result.success).toBe(false);
    });
  });

  describe("Required fields validation", () => {
    it("should reject score missing id", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
      };
      delete (score as any).id;

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(false);
    });

    it("should reject score missing projectId", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
      };
      delete (score as any).projectId;

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(false);
    });

    it("should reject score missing name", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
      };
      delete (score as any).name;

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(false);
    });

    it("should reject score missing dataType", () => {
      const score = {
        ...baseScore,
        value: 1.0,
        stringValue: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(false);
    });

    it("should reject score with invalid dataType", () => {
      const score = {
        ...baseScore,
        dataType: "INVALID" as any,
        value: 1.0,
        stringValue: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(false);
    });
  });

  describe("Nullable fields validation", () => {
    it("should accept score with null traceId", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
        traceId: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should accept score with null comment", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
        comment: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should accept score with null authorUserId", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
        authorUserId: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });
  });

  describe("Score source validation", () => {
    it("should accept API source", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
        source: "API" as const,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should accept EVAL source", () => {
      const score = {
        ...baseScore,
        dataType: "CATEGORICAL" as const,
        value: 1,
        stringValue: "pass",
        source: "EVAL" as const,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should accept ANNOTATION source", () => {
      const score = {
        ...baseScore,
        dataType: "BOOLEAN" as const,
        value: 1,
        stringValue: "true",
        source: "ANNOTATION" as const,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should reject invalid source", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
        source: "INVALID" as any,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(false);
    });
  });

  describe("Metadata validation", () => {
    it("should accept valid metadata object", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
        metadata: {
          modelName: "gpt-4",
          temperature: 0.7,
          tags: ["production", "important"],
        },
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should accept empty metadata object", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
        metadata: {},
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });
  });

  describe("Score entity types", () => {
    it("should validate trace-level score", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 0.9,
        stringValue: null,
        traceId: v4(),
        observationId: null,
        sessionId: null,
        datasetRunId: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should validate observation-level score", () => {
      const score = {
        ...baseScore,
        dataType: "CATEGORICAL" as const,
        value: 1,
        stringValue: "good",
        traceId: v4(),
        observationId: v4(),
        sessionId: null,
        datasetRunId: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should validate session-level score", () => {
      const score = {
        ...baseScore,
        dataType: "BOOLEAN" as const,
        value: 1,
        stringValue: "true",
        traceId: null,
        observationId: null,
        sessionId: v4(),
        datasetRunId: null,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });

    it("should validate dataset run score", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 0.85,
        stringValue: null,
        traceId: null,
        observationId: null,
        sessionId: null,
        datasetRunId: v4(),
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
    });
  });

  describe("Date coercion", () => {
    it("should coerce string to Date for timestamp", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
        timestamp: "2024-01-01T12:00:00Z" as any,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp).toBeInstanceOf(Date);
      }
    });

    it("should coerce number to Date for timestamp", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
        timestamp: Date.now() as any,
      };

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe("Default values", () => {
    it("should use default environment value", () => {
      const score = {
        ...baseScore,
        dataType: "NUMERIC" as const,
        value: 1.0,
        stringValue: null,
      };
      delete (score as any).environment;

      const result = ScoreSchema.safeParse(score);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.environment).toBe("default");
      }
    });
  });
});
