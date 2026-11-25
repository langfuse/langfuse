import { encrypt } from "@langfuse/shared/encryption";
import { LLMAdapter } from "@langfuse/shared";
import {
  topicProcessingConfigSchema,
  type TopicProcessingConfig,
} from "@langfuse/shared/topics";
import type { TopicsModel, TopicsModels } from "@langfuse/shared/topics/server";

/**
 * Model combinations exercised by `../topicsLlmProviders.test.ts`. Each one is a
 * Topics configuration a project could save: one connection and model per
 * slot, the embedding dimensions, and optionally processing limits.
 *
 * Only settings a project can choose belong here. Reasoning effort, provider
 * options, retries, timeouts and the naming output limit are derived from the
 * model in `../models.ts` and `packages/shared/src/server/topics/{text,embeddings}.ts`;
 * to cover another derivation, register a model that triggers it.
 */
export const TOPICS_LLM_COMBINATIONS: TopicsLlmCombination[] = [
  {
    name: "OpenAI",
    summary: { connection: "openai", model: "gpt-6-luna" },
    embedding: {
      connection: "openai",
      model: "text-embedding-3-small",
      dimensions: 1024,
    },
    clustering: { connection: "openai", model: "gpt-6-luna" },
  },
  {
    name: "Anthropic + Bedrock Cohere embeddings",
    summary: { connection: "anthropic", model: "claude-haiku-5-5" },
    embedding: {
      connection: "bedrock",
      model: "eu.cohere.embed-v4:0",
      dimensions: 1024,
    },
    clustering: { connection: "anthropic", model: "claude-haiku-5-5" },
  },
  {
    name: "Bedrock",
    summary: {
      connection: "bedrock",
      model: "eu.anthropic.claude-haiku-5-5",
    },
    embedding: {
      connection: "bedrock",
      model: "eu.cohere.embed-v4:0",
      dimensions: 1024,
    },
    clustering: {
      connection: "bedrock",
      model: "eu.anthropic.claude-haiku-5-5",
    },
  },
  {
    name: "Bedrock (API key)",
    summary: {
      connection: "bedrockApiKey",
      model: "eu.anthropic.claude-haiku-5-5",
    },
    embedding: {
      connection: "bedrockApiKey",
      model: "eu.cohere.embed-v4:0",
      dimensions: 1024,
    },
    clustering: {
      connection: "bedrockApiKey",
      model: "eu.anthropic.claude-haiku-5-5",
    },
  },
  {
    // Cached summary prompts on Bedrock GPT-5.6+ use InvokeModel instead of Converse.
    name: "Bedrock GPT",
    summary: { connection: "bedrock", model: "global.openai.gpt-6-luna" },
    embedding: {
      connection: "bedrock",
      model: "eu.cohere.embed-v4:0",
      dimensions: 1024,
    },
    clustering: { connection: "bedrock", model: "global.openai.gpt-6-luna" },
  },
  {
    name: "Vertex AI",
    summary: { connection: "vertex", model: "gemini-3.8-flash" },
    // text-embedding-005 batches inputs but stops at 768 dimensions.
    embedding: {
      connection: "vertex",
      model: "text-embedding-005",
      dimensions: 768,
    },
    clustering: { connection: "vertex", model: "gemini-3.8-flash" },
  },
  {
    name: "Google AI Studio",
    summary: { connection: "googleAiStudio", model: "gemini-3.1-flash-lite" },
    embedding: {
      connection: "googleAiStudio",
      model: "gemini-embedding-001",
      dimensions: 1024,
    },
    clustering: {
      connection: "googleAiStudio",
      model: "gemini-3.1-flash-lite",
    },
  },
];

type ConnectionName = keyof typeof CONNECTIONS;
type SlotModel = { connection: ConnectionName; model: string };

export type TopicsLlmCombination = {
  name: string;
  summary: SlotModel;
  embedding: SlotModel & { dimensions: number };
  clustering: SlotModel;
  /** Overrides of the processing defaults, such as the per-facet output limit. */
  processing?: Partial<TopicProcessingConfig>;
};

const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const env = (name: string) => process.env[name]!;

const bedrockRegion = () => ({
  region: env("LANGFUSE_LLM_CONNECTION_BEDROCK_REGION"),
});

/** The `LANGFUSE_LLM_CONNECTION_*` secrets shared with llmConnections.test.ts. */
const CONNECTIONS = {
  openai: {
    requiredEnv: ["LANGFUSE_LLM_CONNECTION_OPENAI_KEY"],
    connect: () => ({
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      connection: {
        secretKey: encrypt(env("LANGFUSE_LLM_CONNECTION_OPENAI_KEY")),
      },
    }),
  },
  anthropic: {
    requiredEnv: ["LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY"],
    connect: () => ({
      provider: "anthropic",
      adapter: LLMAdapter.Anthropic,
      connection: {
        secretKey: encrypt(env("LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY")),
      },
    }),
  },
  bedrock: {
    requiredEnv: [
      "LANGFUSE_LLM_CONNECTION_BEDROCK_ACCESS_KEY_ID",
      "LANGFUSE_LLM_CONNECTION_BEDROCK_SECRET_ACCESS_KEY",
      "LANGFUSE_LLM_CONNECTION_BEDROCK_REGION",
    ],
    connect: () => ({
      provider: "bedrock",
      adapter: LLMAdapter.Bedrock,
      connection: {
        secretKey: encrypt(
          JSON.stringify({
            accessKeyId: env("LANGFUSE_LLM_CONNECTION_BEDROCK_ACCESS_KEY_ID"),
            secretAccessKey: env(
              "LANGFUSE_LLM_CONNECTION_BEDROCK_SECRET_ACCESS_KEY",
            ),
          }),
        ),
        config: bedrockRegion(),
      },
    }),
  },
  bedrockApiKey: {
    requiredEnv: [
      "LANGFUSE_LLM_CONNECTION_BEDROCK_API_KEY",
      "LANGFUSE_LLM_CONNECTION_BEDROCK_REGION",
    ],
    connect: () => ({
      provider: "bedrock",
      adapter: LLMAdapter.Bedrock,
      connection: {
        secretKey: encrypt(
          JSON.stringify({
            apiKey: env("LANGFUSE_LLM_CONNECTION_BEDROCK_API_KEY"),
          }),
        ),
        config: bedrockRegion(),
      },
    }),
  },
  vertex: {
    requiredEnv: ["LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY"],
    connect: () => ({
      provider: "google-vertex-ai",
      adapter: LLMAdapter.VertexAI,
      connection: {
        secretKey: encrypt(env("LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY")),
        config: null,
      },
    }),
  },
  googleAiStudio: {
    requiredEnv: ["LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY"],
    connect: () => ({
      provider: "google-ai-studio",
      adapter: LLMAdapter.GoogleAIStudio,
      connection: {
        secretKey: encrypt(env("LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY")),
      },
    }),
  },
} satisfies Record<
  string,
  {
    requiredEnv: string[];
    connect: () => Omit<TopicsModel, "slot" | "model">;
  }
>;

/** Resolves a combination like a saved project configuration; throws when a secret is missing. */
export function resolveTopicsLlmCombination(
  combination: TopicsLlmCombination,
): {
  models: TopicsModels;
  config: TopicProcessingConfig;
} {
  const slots = [
    combination.summary,
    combination.embedding,
    combination.clustering,
  ];
  const missing = [
    ...new Set(
      slots.flatMap(({ connection }) =>
        CONNECTIONS[connection].requiredEnv.filter(
          (name) => !process.env[name],
        ),
      ),
    ),
  ];
  if (missing.length > 0)
    throw new Error(
      `${missing.join(", ")} not set. The "${combination.name}" combination calls real providers. Set the environment variables to run it.`,
    );
  const slot = (
    name: TopicsModel["slot"],
    { connection, model }: SlotModel,
  ): TopicsModel => ({
    ...CONNECTIONS[connection].connect(),
    slot: name,
    model,
  });
  return {
    models: {
      projectId: PROJECT_ID,
      enabled: true,
      summary: slot("summary", combination.summary),
      embedding: {
        ...slot("embedding", combination.embedding),
        dimensions: combination.embedding.dimensions,
      },
      clustering: slot("clustering", combination.clustering),
    },
    config: topicProcessingConfigSchema.parse(combination.processing ?? {}),
  };
}
