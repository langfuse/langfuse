import { describe, test, expect } from "vitest";
import { fetchLLMCompletion } from "@langfuse/shared/src/server";
import { ChatMessageType, LLMAdapter } from "@langfuse/shared";
import { z } from "zod/v3";

/**
 * LLM Connection Integration Tests
 *
 * These tests verify that all supported LLM adapters work correctly with live API calls.
 * Each adapter is tested with:
 * 1. Simple completion
 * 2. Structured output (using eval schema: {score: number, reasoning: string})
 * 3. Tool calling
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

// Eval schema matching production usage
const evalOutputSchema = z.object({
  score: z.number(),
  reasoning: z.string(),
});

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

      const { completion } = await fetchLLMCompletion({
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
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 10,
        },
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY!,
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("structured output - eval schema", async () => {
      checkEnvVar();

      const { completion } = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content:
              "Evaluate the quality of this response: 'The answer is 42.' Provide a score from 0-100 and reasoning.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 200,
        },
        structuredOutputSchema: evalOutputSchema,
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY!,
      });

      const parsed = evalOutputSchema.safeParse(completion);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(typeof parsed.data.score).toBe("number");
        expect(typeof parsed.data.reasoning).toBe("string");
        expect(parsed.data.reasoning.length).toBeGreaterThan(0);
      }
    }, 30_000);

    test("tool calling", async () => {
      checkEnvVar();

      const { completion } = await fetchLLMCompletion({
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
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY!,
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);
  });

  describe("Anthropic", () => {
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

      const { completion } = await fetchLLMCompletion({
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
          model: "claude-3-5-haiku-20241022",
          temperature: 0,
          max_tokens: 10,
        },
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY!,
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("structured output - eval schema", async () => {
      checkEnvVar();

      const { completion } = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content:
              "Evaluate the quality of this response: 'The answer is 42.' Provide a score from 0-100 and reasoning.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "anthropic",
          adapter: LLMAdapter.Anthropic,
          model: "claude-3-5-haiku-20241022",
          temperature: 0,
          max_tokens: 200,
        },
        structuredOutputSchema: evalOutputSchema,
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY!,
      });

      const parsed = evalOutputSchema.safeParse(completion);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(typeof parsed.data.score).toBe("number");
        expect(typeof parsed.data.reasoning).toBe("string");
        expect(parsed.data.reasoning.length).toBeGreaterThan(0);
      }
    }, 30_000);

    test("tool calling", async () => {
      checkEnvVar();

      const { completion } = await fetchLLMCompletion({
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
          model: "claude-3-5-haiku-20241022",
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY!,
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

      const { completion } = await fetchLLMCompletion({
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
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_AZURE_KEY!,
        baseURL: process.env.LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL!,
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("structured output - eval schema", async () => {
      checkEnvVars();

      const { completion } = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content:
              "Evaluate the quality of this response: 'The answer is 42.' Provide a score from 0-100 and reasoning.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "azure",
          adapter: LLMAdapter.Azure,
          model: process.env.LANGFUSE_LLM_CONNECTION_AZURE_MODEL!,
          temperature: 0,
          max_tokens: 200,
        },
        structuredOutputSchema: evalOutputSchema,
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_AZURE_KEY!,
        baseURL: process.env.LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL!,
      });

      const parsed = evalOutputSchema.safeParse(completion);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(typeof parsed.data.score).toBe("number");
        expect(typeof parsed.data.reasoning).toBe("string");
        expect(parsed.data.reasoning.length).toBeGreaterThan(0);
      }
    }, 30_000);

    test("tool calling", async () => {
      checkEnvVars();

      const { completion } = await fetchLLMCompletion({
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
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_AZURE_KEY!,
        baseURL: process.env.LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL!,
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);
  });

  describe("Bedrock", () => {
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

      const { completion } = await fetchLLMCompletion({
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
          model: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
          temperature: 0,
          max_tokens: 10,
        },
        apiKey: getApiKey(),
        config: getConfig(),
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("structured output - eval schema", async () => {
      checkEnvVars();

      const { completion } = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content:
              "Evaluate the quality of this response: 'The answer is 42.' Provide a score from 0-100 and reasoning.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "bedrock",
          adapter: LLMAdapter.Bedrock,
          model: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
          temperature: 0,
          max_tokens: 200,
        },
        structuredOutputSchema: evalOutputSchema,
        apiKey: getApiKey(),
        config: getConfig(),
      });

      const parsed = evalOutputSchema.safeParse(completion);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(typeof parsed.data.score).toBe("number");
        expect(typeof parsed.data.reasoning).toBe("string");
        expect(parsed.data.reasoning.length).toBeGreaterThan(0);
      }
    }, 30_000);

    test("tool calling", async () => {
      checkEnvVars();

      const { completion } = await fetchLLMCompletion({
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
          model: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        apiKey: getApiKey(),
        config: getConfig(),
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);
  });

  describe("VertexAI", () => {
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

      const { completion } = await fetchLLMCompletion({
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
          model: "gemini-2.0-flash",
          temperature: 0,
          max_tokens: 10,
        },
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY!,
        config: null,
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("structured output - eval schema", async () => {
      checkEnvVar();

      const { completion } = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content:
              "Evaluate the quality of this response: 'The answer is 42.' Provide a score from 0-100 and reasoning.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-vertex-ai",
          adapter: LLMAdapter.VertexAI,
          model: "gemini-2.0-flash",
          temperature: 0,
          max_tokens: 200,
        },
        structuredOutputSchema: evalOutputSchema,
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY!,
        config: null,
      });

      const parsed = evalOutputSchema.safeParse(completion);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(typeof parsed.data.score).toBe("number");
        expect(typeof parsed.data.reasoning).toBe("string");
        expect(parsed.data.reasoning.length).toBeGreaterThan(0);
      }
    }, 30_000);

    test("tool calling", async () => {
      checkEnvVar();

      const { completion } = await fetchLLMCompletion({
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
          model: "gemini-2.0-flash",
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY!,
        config: null,
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);
  });

  describe("GoogleAIStudio", () => {
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

      const { completion } = await fetchLLMCompletion({
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
          model: "gemini-2.0-flash",
          temperature: 0,
          max_tokens: 10,
        },
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY!,
      });

      expect(typeof completion).toBe("string");
      expect(completion).toContain("4");
    }, 30_000);

    test("structured output - eval schema", async () => {
      checkEnvVar();

      const { completion } = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content:
              "Evaluate the quality of this response: 'The answer is 42.' Provide a score from 0-100 and reasoning.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider: "google-ai-studio",
          adapter: LLMAdapter.GoogleAIStudio,
          model: "gemini-2.0-flash",
          temperature: 0,
          max_tokens: 200,
        },
        structuredOutputSchema: evalOutputSchema,
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY!,
      });

      const parsed = evalOutputSchema.safeParse(completion);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(typeof parsed.data.score).toBe("number");
        expect(typeof parsed.data.reasoning).toBe("string");
        expect(parsed.data.reasoning.length).toBeGreaterThan(0);
      }
    }, 30_000);

    test("tool calling", async () => {
      checkEnvVar();

      const { completion } = await fetchLLMCompletion({
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
          model: "gemini-2.0-flash",
          temperature: 0,
          max_tokens: 100,
        },
        tools: [weatherTool],
        apiKey: process.env.LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY!,
      });

      expect(completion).toHaveProperty("tool_calls");
      expect(Array.isArray(completion.tool_calls)).toBe(true);
      expect(completion.tool_calls.length).toBeGreaterThan(0);
      expect(completion.tool_calls[0].name).toBe("get_weather");
      expect(completion.tool_calls[0].args).toHaveProperty("location");
    }, 30_000);
  });
});
