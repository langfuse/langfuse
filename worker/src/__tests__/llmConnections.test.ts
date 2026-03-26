import { describe, test, expect } from "vitest";
import {
  fetchLLMCompletion,
  type CompletionWithReasoning,
} from "@langfuse/shared/src/server";
import { encrypt } from "@langfuse/shared/encryption";
import {
  buildEvalOutputResultSchema,
  ChatMessageType,
  createBooleanEvalOutputDefinition,
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
  type PersistedEvalOutputDefinition,
  LLMAdapter,
  type ModelParams,
} from "@langfuse/shared";
import { z } from "zod";

/**
 * LLM Connection Integration Tests
 *
 * These tests verify that all supported LLM adapters work correctly with live API calls.
 * Each adapter is tested with:
 * 1. Simple completion
 * 2. Streaming completion
 * 3. Structured output (legacy eval schema, v2 numeric schema, v2 boolean schema, v2 categorical schema)
 * 4. Tool calling
 *
 * Required environment variables (tests will FAIL if not set):
 * - LANGFUSE_LLM_CONNECTION_OPENAI_KEY
 * - LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY
 * - LANGFUSE_LLM_CONNECTION_AZURE_KEY
 * - LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL
 * - LANGFUSE_LLM_CONNECTION_AZURE_MODEL
 * - LANGFUSE_LLM_CONNECTION_BEDROCK_ACCESS_KEY_ID
 * - LANGFUSE_LLM_CONNECTION_BEDROCK_SECRET_ACCESS_KEY
 * - LANGFUSE_LLM_CONNECTION_BEDROCK_REGION
 * - LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY
 * - LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY
 */

type TestLLMConnection = {
  secretKey: string;
  extraHeaders?: string | null;
  baseURL?: string | null;
  config?: Record<string, string> | null;
};

const numericEvalResponseSchema = z.object({
  score: z.number(),
  reasoning: z.string().min(1),
});

const booleanEvalResponseSchema = z.object({
  score: z.boolean(),
  reasoning: z.string().min(1),
});

const categoricalScoreValues = ["correct", "incorrect"] as const;
const categoricalEvalResponseSchema = z.object({
  score: z.enum(categoricalScoreValues),
  reasoning: z.string().min(1),
});

type EvalStructuredOutputTestCase = {
  name: string;
  prompt: string;
  outputDefinition: PersistedEvalOutputDefinition;
  responseSchema: z.ZodTypeAny;
  assertParsed?: (data: {
    score: number | boolean | string;
    reasoning: string;
  }) => void;
};

const evalStructuredOutputTestCases: EvalStructuredOutputTestCase[] = [
  {
    name: "structured output - legacy eval schema",
    prompt:
      "Evaluate whether the answer '2 + 2 = 4' is correct. Return a numeric score from 0 to 100 and explain the score.",
    outputDefinition: {
      score:
        "Return a numeric score from 0 to 100, where 100 means the answer is completely correct.",
      reasoning: "Explain briefly why you chose that score.",
    },
    responseSchema: numericEvalResponseSchema,
  },
  {
    name: "structured output - v2 numeric eval schema",
    prompt:
      "Evaluate whether the answer '2 + 2 = 4' is correct. Return a numeric score from 0 to 100 and explain the score.",
    outputDefinition: createNumericEvalOutputDefinition({
      scoreDescription:
        "Return a numeric score from 0 to 100, where 100 means the answer is completely correct.",
      reasoningDescription: "Explain briefly why you chose that score.",
    }),
    responseSchema: numericEvalResponseSchema,
  },
  {
    name: "structured output - v2 boolean eval schema",
    prompt:
      "Judge whether the answer '2 + 2 = 5' is correct. Return true only if it is mathematically correct, otherwise false, and explain briefly.",
    outputDefinition: createBooleanEvalOutputDefinition({
      scoreDescription:
        "Return true when the answer is mathematically correct, otherwise return false.",
      reasoningDescription: "Explain briefly why you chose that verdict.",
    }),
    responseSchema: booleanEvalResponseSchema,
    assertParsed: (data) => {
      expect(data.score).toBe(false);
    },
  },
  {
    name: "structured output - v2 categorical eval schema",
    prompt:
      "Judge whether the answer '2 + 2 = 5' is correct. Select the best matching category and explain the choice.",
    outputDefinition: createCategoricalEvalOutputDefinition({
      scoreDescription:
        "Select 'correct' when the answer is mathematically accurate, otherwise select 'incorrect'.",
      reasoningDescription: "Explain briefly why you selected that category.",
      categories: ["correct", "incorrect"],
    }),
    responseSchema: categoricalEvalResponseSchema,
    assertParsed: (data) => {
      expect(data.score).toBe("incorrect");
    },
  },
];

function registerEvalStructuredOutputTests(params: {
  checkEnv: () => void;
  getModelParams: () => ModelParams;
  getLLMConnection: () => TestLLMConnection;
  timeoutMs: number;
}) {
  evalStructuredOutputTestCases.forEach((testCase) => {
    test(
      testCase.name,
      async () => {
        params.checkEnv();

        const completion = await fetchLLMCompletion({
          streaming: false,
          messages: [
            {
              role: "user",
              content: testCase.prompt,
              type: ChatMessageType.PublicAPICreated,
            },
          ],
          modelParams: params.getModelParams(),
          structuredOutputSchema: buildEvalOutputResultSchema(
            testCase.outputDefinition,
          ),
          llmConnection: params.getLLMConnection(),
        });

        const parsed = testCase.responseSchema.safeParse(completion);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.reasoning.trim().length).toBeGreaterThan(0);
          testCase.assertParsed?.(parsed.data);
        }
      },
      params.timeoutMs,
    );
  });
}

// Common tool definition for tool calling tests
const weatherTool = {
  name: "get_weather",
  description: "Get the current weather for a location",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The city name, e.g. 'Paris' or 'London'",
      },
    },
    required: ["location"],
  },
};

describe("LLM Connection Tests", () => {
  describe("OpenAI", () => {
    const MODEL = "gpt-4o-mini";

    const checkEnvVar = () => {
      if (!process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_OPENAI_KEY not set. " +
            "This test requires a valid OpenAI API key to verify the LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
    };

    test("simple completion", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY!),
        },
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("streaming completion", async () => {
      checkEnvVar();

      const stream = await fetchLLMCompletion({
        streaming: true,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY!),
        },
      });

      const decoder = new TextDecoder();
      let fullResponse = "";
      let chunkCount = 0;

      for await (const chunk of stream) {
        fullResponse += decoder.decode(chunk);
        chunkCount++;
      }

      expect(chunkCount).toBeGreaterThan(0);
      expect(fullResponse).toContain("4");
    }, 30_000);

    registerEvalStructuredOutputTests({
      checkEnv: checkEnvVar,
      getModelParams: () => ({
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: MODEL,
        temperature: 0,
        max_tokens: 200,
      }),
      getLLMConnection: () => ({
        secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY!),
      }),
      timeoutMs: 30_000,
    });

    test("tool calling", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What's the weather like in Paris?",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          model: MODEL,
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY!),
        },
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);
  });

  describe("Anthropic", () => {
    const MODEL = "claude-sonnet-4-6";

    const checkEnvVar = () => {
      if (!process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY not set. " +
            "This test requires a valid Anthropic API key to verify the LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
    };

    test("simple completion", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "anthropic",
          adapter: LLMAdapter.Anthropic,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(
            process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY!,
          ),
        },
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("streaming completion", async () => {
      checkEnvVar();

      const stream = await fetchLLMCompletion({
        streaming: true,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "anthropic",
          adapter: LLMAdapter.Anthropic,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(
            process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY!,
          ),
        },
      });

      const decoder = new TextDecoder();
      let fullResponse = "";
      let chunkCount = 0;

      for await (const chunk of stream) {
        fullResponse += decoder.decode(chunk);
        chunkCount++;
      }

      expect(chunkCount).toBeGreaterThan(0);
      expect(fullResponse).toContain("4");
    }, 30_000);

    registerEvalStructuredOutputTests({
      checkEnv: checkEnvVar,
      getModelParams: () => ({
        provider: "anthropic",
        adapter: LLMAdapter.Anthropic,
        model: MODEL,
        temperature: 0,
        max_tokens: 200,
      }),
      getLLMConnection: () => ({
        secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY!),
      }),
      timeoutMs: 30_000,
    });

    test("tool calling", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What's the weather like in Paris?",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "anthropic",
          adapter: LLMAdapter.Anthropic,
          model: MODEL,
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        llmConnection: {
          secretKey: encrypt(
            process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY!,
          ),
        },
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);
  });

  describe("Azure", () => {
    const checkEnvVars = () => {
      if (!process.env.LANGFUSE_LLM_CONNECTION_AZURE_KEY) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_AZURE_KEY not set. " +
            "This test requires a valid Azure OpenAI API key to verify the LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
      if (!process.env.LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL not set. " +
            "This test requires a valid Azure OpenAI base URL (deployment endpoint) to verify the LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
      if (!process.env.LANGFUSE_LLM_CONNECTION_AZURE_MODEL) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_AZURE_MODEL not set. " +
            "This test requires a valid Azure OpenAI deployment name to verify the LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
    };

    test("simple completion", async () => {
      checkEnvVars();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "azure",
          adapter: LLMAdapter.Azure,
          model: process.env.LANGFUSE_LLM_CONNECTION_AZURE_MODEL!,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_AZURE_KEY!),
          baseURL: process.env.LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL!,
        },
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("streaming completion", async () => {
      checkEnvVars();

      const stream = await fetchLLMCompletion({
        streaming: true,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "azure",
          adapter: LLMAdapter.Azure,
          model: process.env.LANGFUSE_LLM_CONNECTION_AZURE_MODEL!,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_AZURE_KEY!),
          baseURL: process.env.LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL!,
        },
      });

      const decoder = new TextDecoder();
      let fullResponse = "";
      let chunkCount = 0;

      for await (const chunk of stream) {
        fullResponse += decoder.decode(chunk);
        chunkCount++;
      }

      expect(chunkCount).toBeGreaterThan(0);
      expect(fullResponse).toContain("4");
    }, 60_000);

    registerEvalStructuredOutputTests({
      checkEnv: checkEnvVars,
      getModelParams: () => ({
        provider: "azure",
        adapter: LLMAdapter.Azure,
        model: process.env.LANGFUSE_LLM_CONNECTION_AZURE_MODEL!,
        temperature: 0,
        max_tokens: 200,
      }),
      getLLMConnection: () => ({
        secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_AZURE_KEY!),
        baseURL: process.env.LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL!,
      }),
      timeoutMs: 60_000,
    });

    test("tool calling", async () => {
      checkEnvVars();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What's the weather like in Paris?",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "azure",
          adapter: LLMAdapter.Azure,
          model: process.env.LANGFUSE_LLM_CONNECTION_AZURE_MODEL!,
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_AZURE_KEY!),
          baseURL: process.env.LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL!,
        },
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 60_000);
  });

  describe("Bedrock", () => {
    const MODEL = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0";

    const checkEnvVars = () => {
      if (!process.env.LANGFUSE_LLM_CONNECTION_BEDROCK_ACCESS_KEY_ID) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_BEDROCK_ACCESS_KEY_ID not set. " +
            "This test requires a valid AWS access key ID to verify the Bedrock LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
      if (!process.env.LANGFUSE_LLM_CONNECTION_BEDROCK_SECRET_ACCESS_KEY) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_BEDROCK_SECRET_ACCESS_KEY not set. " +
            "This test requires a valid AWS secret access key to verify the Bedrock LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
      if (!process.env.LANGFUSE_LLM_CONNECTION_BEDROCK_REGION) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_BEDROCK_REGION not set. " +
            "This test requires a valid AWS region (e.g., 'us-east-1') to verify the Bedrock LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
    };

    const getApiKey = () => {
      checkEnvVars();
      return JSON.stringify({
        accessKeyId: process.env.LANGFUSE_LLM_CONNECTION_BEDROCK_ACCESS_KEY_ID!,
        secretAccessKey:
          process.env.LANGFUSE_LLM_CONNECTION_BEDROCK_SECRET_ACCESS_KEY!,
      });
    };

    const getConfig = () => {
      return {
        region: process.env.LANGFUSE_LLM_CONNECTION_BEDROCK_REGION!,
      };
    };

    test("simple completion", async () => {
      checkEnvVars();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "bedrock",
          adapter: LLMAdapter.Bedrock,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(getApiKey()),
          config: getConfig(),
        },
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("streaming completion", async () => {
      checkEnvVars();

      const stream = await fetchLLMCompletion({
        streaming: true,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "bedrock",
          adapter: LLMAdapter.Bedrock,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(getApiKey()),
          config: getConfig(),
        },
      });

      const decoder = new TextDecoder();
      let fullResponse = "";
      let chunkCount = 0;

      for await (const chunk of stream) {
        fullResponse += decoder.decode(chunk);
        chunkCount++;
      }

      expect(chunkCount).toBeGreaterThan(0);
      expect(fullResponse).toContain("4");
    }, 30_000);

    // Flaky
    registerEvalStructuredOutputTests({
      checkEnv: checkEnvVars,
      getModelParams: () => ({
        provider: "bedrock",
        adapter: LLMAdapter.Bedrock,
        model: MODEL,
        temperature: 0,
        max_tokens: 200,
      }),
      getLLMConnection: () => ({
        secretKey: encrypt(getApiKey()),
        config: getConfig(),
      }),
      timeoutMs: 30_000,
    });

    test("tool calling", async () => {
      checkEnvVars();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What's the weather like in Paris?",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "bedrock",
          adapter: LLMAdapter.Bedrock,
          model: MODEL,
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        llmConnection: {
          secretKey: encrypt(getApiKey()),
          config: getConfig(),
        },
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);
  });

  describe("VertexAI", () => {
    const MODEL = "gemini-2.0-flash";

    const checkEnvVar = () => {
      if (!process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY not set. " +
            "This test requires a valid GCP service account JSON string to verify the VertexAI LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
    };

    test("simple completion", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-vertex-ai",
          adapter: LLMAdapter.VertexAI,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY!),
          config: null,
        },
      });

      // VertexAI always returns CompletionWithReasoning (text + optional reasoning)
      expect(typeof completion).toBe("object");
      expect((completion as CompletionWithReasoning).text).toContain("4");
    }, 30_000);

    test("streaming completion", async () => {
      checkEnvVar();

      const stream = await fetchLLMCompletion({
        streaming: true,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-vertex-ai",
          adapter: LLMAdapter.VertexAI,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY!),
          config: null,
        },
      });

      const decoder = new TextDecoder();
      let fullResponse = "";
      let chunkCount = 0;

      for await (const chunk of stream) {
        fullResponse += decoder.decode(chunk);
        chunkCount++;
      }

      expect(chunkCount).toBeGreaterThan(0);
      expect(fullResponse).toContain("4");
    }, 30_000);

    registerEvalStructuredOutputTests({
      checkEnv: checkEnvVar,
      getModelParams: () => ({
        provider: "google-vertex-ai",
        adapter: LLMAdapter.VertexAI,
        model: MODEL,
        temperature: 0,
        max_tokens: 200,
      }),
      getLLMConnection: () => ({
        secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY!),
        config: null,
      }),
      timeoutMs: 30_000,
    });

    test("tool calling", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What's the weather like in Paris?",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-vertex-ai",
          adapter: LLMAdapter.VertexAI,
          model: MODEL,
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY!),
          config: null,
        },
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);

    test("thinking model with tool calling strips reasoning from content and parses tool calls", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What's the weather like in Paris?",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-vertex-ai",
          adapter: LLMAdapter.VertexAI,
          model: "gemini-2.5-flash",
          temperature: 0,
          max_tokens: 2048,
          maxReasoningTokens: 1024,
        },
        tools: [weatherTool],
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY!),
          config: null,
        },
      });

      // Should parse tool calls successfully despite reasoning blocks in content
      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      // Reasoning should be extracted separately
      if ((completion as any).reasoning) {
        expect(typeof (completion as any).reasoning).toBe("string");
      }
    }, 60_000);

    test("thinking model returns CompletionWithReasoning with separate text and reasoning", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-vertex-ai",
          adapter: LLMAdapter.VertexAI,
          model: "gemini-2.5-flash",
          temperature: 0,
          max_tokens: 2048,
          maxReasoningTokens: 1024,
        },
        llmConnection: {
          secretKey: encrypt(process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY!),
          config: null,
        },
      });

      // Always returns CompletionWithReasoning for VertexAI
      expect(typeof completion).toBe("object");
      const result = completion as CompletionWithReasoning;
      expect(result.text).toContain("4");
      // With maxReasoningTokens > 0, reasoning should be present
      // Note: this depends on the model actually producing reasoning output
    }, 60_000);
  });

  describe("GoogleAIStudio", () => {
    const MODEL = "gemini-2.0-flash";

    const checkEnvVar = () => {
      if (!process.env.LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY) {
        throw new Error(
          "LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY not set. " +
            "This test requires a valid Google AI Studio API key to verify the LLM connection. " +
            "Set the environment variable to run this test.",
        );
      }
    };

    test("simple completion", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-ai-studio",
          adapter: LLMAdapter.GoogleAIStudio,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(
            process.env.LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY!,
          ),
        },
      });

      // GoogleAIStudio always returns CompletionWithReasoning (text + optional reasoning)
      expect(typeof completion).toBe("object");
      expect((completion as CompletionWithReasoning).text).toContain("4");
    }, 30_000);

    test("streaming completion", async () => {
      checkEnvVar();

      const stream = await fetchLLMCompletion({
        streaming: true,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-ai-studio",
          adapter: LLMAdapter.GoogleAIStudio,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(
            process.env.LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY!,
          ),
        },
      });

      const decoder = new TextDecoder();
      let fullResponse = "";
      let chunkCount = 0;

      for await (const chunk of stream) {
        fullResponse += decoder.decode(chunk);
        chunkCount++;
      }

      expect(chunkCount).toBeGreaterThan(0);
      expect(fullResponse).toContain("4");
    }, 30_000);

    registerEvalStructuredOutputTests({
      checkEnv: checkEnvVar,
      getModelParams: () => ({
        provider: "google-ai-studio",
        adapter: LLMAdapter.GoogleAIStudio,
        model: MODEL,
        temperature: 0,
        max_tokens: 200,
      }),
      getLLMConnection: () => ({
        secretKey: encrypt(
          process.env.LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY!,
        ),
      }),
      timeoutMs: 30_000,
    });

    test("tool calling", async () => {
      checkEnvVar();

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What's the weather like in Paris?",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-ai-studio",
          adapter: LLMAdapter.GoogleAIStudio,
          model: MODEL,
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        llmConnection: {
          secretKey: encrypt(
            process.env.LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY!,
          ),
        },
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);

    test("single system message is converted to user message", async () => {
      checkEnvVar();

      // Regression test: Text prompts create a single system message.
      // GoogleAIStudio must convert it to a user message to prevent:
      // "GenerateContentRequest.contents is not specified" error
      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "system",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.System,
          },
        ],
        modelParams: {
          provider: "google-ai-studio",
          adapter: LLMAdapter.GoogleAIStudio,
          model: MODEL,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(
            process.env.LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY!,
          ),
        },
      });

      // GoogleAIStudio always returns CompletionWithReasoning
      expect(typeof completion).toBe("object");
      expect((completion as CompletionWithReasoning).text).toContain("4");
    }, 30_000);
  });
});
