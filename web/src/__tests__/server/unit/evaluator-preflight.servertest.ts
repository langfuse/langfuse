/** @jest-environment node */

jest.mock("@langfuse/shared/src/server", () => {
  const actual = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...actual,
    DefaultEvalModelService: {
      fetchValidModelConfig: jest.fn(),
    },
    logger: {
      debug: jest.fn(),
    },
    testModelCall: jest.fn(),
  };
});

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
  const mockFetchValidModelConfig = jest.mocked(
    DefaultEvalModelService.fetchValidModelConfig,
  );
  const mockTestModelCall = jest.mocked(testModelCall);
  const originalSkipFlag =
    process.env.LANGFUSE_SKIP_EVALUATOR_MODEL_CALL_VALIDATION;

  beforeEach(() => {
    jest.resetAllMocks();
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
