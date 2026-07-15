vi.mock("@langfuse/shared/src/server", async () => ({
  ...(await vi.importActual("@langfuse/shared/src/server")),
  DefaultEvalModelService: {
    fetchValidModelConfig: vi.fn(),
  },
  logger: {
    debug: vi.fn(),
  },
  getLLMErrorInfo: vi.fn(),
  testModelCall: vi.fn(),
}));

import {
  createNumericEvalOutputDefinition,
  LLMAdapter,
} from "@langfuse/shared";
import {
  DefaultEvalModelService,
  getLLMErrorInfo,
  testModelCall,
} from "@langfuse/shared/src/server";
import { getEvaluatorDefinitionPreflightError } from "@/src/features/evals/server/evaluator-preflight";

const numericOutputDefinition = createNumericEvalOutputDefinition({
  reasoningDescription: "Why the score was assigned",
  scoreDescription: "A score between 0 and 1",
});

// The real config carries a full parsed LLM API key record plus the adapter;
// the preflight only reads the connection fields stubbed below, so the
// fixture stays minimal behind a cast.
type ValidModelConfig = Extract<
  Awaited<ReturnType<typeof DefaultEvalModelService.fetchValidModelConfig>>,
  { valid: true }
>["config"];

describe("evaluator preflight", () => {
  const mockFetchValidModelConfig = vi.mocked(
    DefaultEvalModelService.fetchValidModelConfig,
  );
  const mockGetLLMErrorInfo = vi.mocked(getLLMErrorInfo);
  const mockTestModelCall = vi.mocked(testModelCall);
  const originalSkipFlag =
    process.env.LANGFUSE_SKIP_EVALUATOR_MODEL_CALL_VALIDATION;

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.LANGFUSE_SKIP_EVALUATOR_MODEL_CALL_VALIDATION;
    mockFetchValidModelConfig.mockResolvedValue({
      valid: true,
      config: {
        provider: "openai-test",
        model: "gpt-4.1-mini",
        modelParams: undefined,
        apiKey: {
          secretKey: "encrypted",
          extraHeaders: null,
          baseURL: "http://127.0.0.1:4011/v1",
          config: null,
          adapter: LLMAdapter.OpenAI,
        },
      } as unknown as ValidModelConfig,
    });
  });

  afterAll(() => {
    if (originalSkipFlag === undefined) {
      delete process.env.LANGFUSE_SKIP_EVALUATOR_MODEL_CALL_VALIDATION;
      return;
    }

    process.env.LANGFUSE_SKIP_EVALUATOR_MODEL_CALL_VALIDATION =
      originalSkipFlag;
  });

  it("points to the LLM connection settings when no valid model is configured", async () => {
    mockFetchValidModelConfig.mockResolvedValue({
      valid: false,
      error: "No default model or custom model configured for project p1",
    });

    const result = await getEvaluatorDefinitionPreflightError({
      projectId: "p1",
      template: {
        name: "Answer correctness",
        outputDefinition: numericOutputDefinition,
      },
    });

    expect(result).toBe(
      `No valid LLM model found for evaluator "Answer correctness". No default model or custom model configured for project p1. Configure an LLM connection for this project under Settings → LLM Connections (/project/p1/settings/llm-connections) before creating llm_as_judge evaluators.`,
    );
  });

  it("skips the live provider call when the explicit test flag is enabled", async () => {
    process.env.LANGFUSE_SKIP_EVALUATOR_MODEL_CALL_VALIDATION = "true";

    const result = await getEvaluatorDefinitionPreflightError({
      projectId: "project_test",
      template: {
        name: "Answer correctness",
        outputDefinition: numericOutputDefinition,
      },
    });

    expect(result).toBeNull();
    expect(mockTestModelCall).not.toHaveBeenCalled();
  });

  it("preserves actionable output definition validation errors", async () => {
    const result = await getEvaluatorDefinitionPreflightError({
      projectId: "project_test",
      template: {
        name: "Answer correctness",
        outputDefinition: {
          version: 2,
          dataType: "CATEGORICAL",
          reasoning: { description: "Why the score was assigned" },
          score: {
            description: "The matching category",
            categories: [],
            shouldAllowMultipleMatches: false,
          },
        },
      },
    });

    expect(result).toContain("Add at least 2 categories");
    expect(mockTestModelCall).not.toHaveBeenCalled();
    expect(mockGetLLMErrorInfo).not.toHaveBeenCalled();
  });

  describe("live provider call failures", () => {
    // The preflight skips the provider call in test-like environments;
    // stub these so the mocked testModelCall is actually reached.
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/postgres");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns a clean model-not-found message when the provider responds with 404", async () => {
      mockTestModelCall.mockRejectedValue(
        new Error(
          '404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-sonnet-20240229"}}',
        ),
      );
      mockGetLLMErrorInfo.mockReturnValue({
        kind: "provider",
        message:
          '404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-sonnet-20240229"}}',
        statusCode: 404,
        isRetryable: false,
        error: new Error("provider error"),
      });

      const result = await getEvaluatorDefinitionPreflightError({
        projectId: "project_test",
        template: {
          name: "Answer correctness",
          outputDefinition: numericOutputDefinition,
        },
      });

      expect(result).toBe(
        `Model configuration not valid for evaluator "Answer correctness". The provider could not find model 'gpt-4.1-mini' — it may be retired, misspelled, or not available to your API key. Update the evaluator's model or the project's default evaluation model.`,
      );
    });

    it("keeps the provider error message for non-404 failures", async () => {
      mockTestModelCall.mockRejectedValue(
        new Error("401 Incorrect API key provided"),
      );
      mockGetLLMErrorInfo.mockReturnValue({
        kind: "provider",
        message: "401 Incorrect API key provided",
        statusCode: 401,
        isRetryable: false,
        error: new Error("provider error"),
      });

      const result = await getEvaluatorDefinitionPreflightError({
        projectId: "project_test",
        template: {
          name: "Answer correctness",
          outputDefinition: numericOutputDefinition,
        },
      });

      expect(result).toBe(
        `Model configuration not valid for evaluator "Answer correctness". 401 Incorrect API key provided`,
      );
    });

    it("does not expose unknown model call errors", async () => {
      mockTestModelCall.mockRejectedValue(
        new Error("sensitive internal model call detail"),
      );
      mockGetLLMErrorInfo.mockReturnValue(null);

      const result = await getEvaluatorDefinitionPreflightError({
        projectId: "project_test",
        template: {
          name: "Answer correctness",
          outputDefinition: numericOutputDefinition,
        },
      });

      expect(result).toBe(
        `Model configuration not valid for evaluator "Answer correctness". An internal error occurred`,
      );
      expect(result).not.toContain("sensitive internal model call detail");
    });
  });
});
