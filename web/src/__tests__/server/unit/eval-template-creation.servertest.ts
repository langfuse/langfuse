vi.mock("@langfuse/shared/src/server", async () => ({
  ...(await vi.importActual("@langfuse/shared/src/server")),
  DefaultEvalModelService: {
    fetchValidModelConfig: vi.fn(),
  },
  testModelCall: vi.fn(),
}));

import {
  createNumericEvalOutputDefinition,
  EvalTemplateType,
  LLMAdapter,
} from "@langfuse/shared";
import {
  DefaultEvalModelService,
  testModelCall,
} from "@langfuse/shared/src/server";
import { validateEvalTemplateCreation } from "@/src/features/evals/server/evalTemplateCreation";

describe("eval template creation validation", () => {
  const mockFetchValidModelConfig = vi.mocked(
    DefaultEvalModelService.fetchValidModelConfig,
  );
  const mockTestModelCall = vi.mocked(testModelCall);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes resolved default model params into the LLM-as-judge test call", async () => {
    mockFetchValidModelConfig.mockResolvedValueOnce({
      valid: true,
      config: {
        provider: "openai-test",
        model: "gemini-2.5-pro",
        modelParams: { max_tokens: 4096, temperature: 0 },
        adapter: LLMAdapter.OpenAI,
        apiKey: {
          secretKey: "encrypted",
          extraHeaders: null,
          baseURL: "http://127.0.0.1:4011/v1",
          config: null,
          adapter: LLMAdapter.OpenAI,
        },
      },
    });

    await validateEvalTemplateCreation({
      type: EvalTemplateType.LLM_AS_JUDGE,
      name: "Answer correctness",
      projectId: "project_test",
      prompt: "Judge {{input}}",
      provider: undefined,
      model: undefined,
      modelParams: undefined,
      vars: ["input"],
      outputDefinition: createNumericEvalOutputDefinition({
        reasoningDescription: "Why the score was assigned",
        scoreDescription: "A score between 0 and 1",
      }),
    });

    expect(mockFetchValidModelConfig).toHaveBeenCalledWith(
      "project_test",
      undefined,
      undefined,
      undefined,
    );
    expect(mockTestModelCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai-test",
        model: "gemini-2.5-pro",
        modelConfig: { max_tokens: 4096, temperature: 0 },
      }),
    );
  });
});
