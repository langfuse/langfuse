vi.mock("@langfuse/shared/src/server", async () => ({
  ...(await vi.importActual("@langfuse/shared/src/server")),
  DefaultEvalModelService: {
    fetchValidModelConfig: vi.fn(),
  },
  logger: {
    debug: vi.fn(),
  },
  testModelCall: vi.fn(),
}));

import {
  createNumericEvalOutputDefinition,
  LLMAdapter,
} from "@langfuse/shared";
import {
  DefaultEvalModelService,
  testModelCall,
} from "@langfuse/shared/src/server";
import { getEvaluatorDefinitionPreflightError } from "@/src/features/evals/server/evaluator-preflight";

const numericOutputDefinition = createNumericEvalOutputDefinition({
  reasoningDescription: "Why the score was assigned",
  scoreDescription: "A score between 0 and 1",
});

describe("evaluator preflight", () => {
  const mockFetchValidModelConfig = vi.mocked(
    DefaultEvalModelService.fetchValidModelConfig,
  );
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
      },
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
});
