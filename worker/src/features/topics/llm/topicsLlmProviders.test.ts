import { describe, expect, test } from "vitest";
import { encrypt } from "@langfuse/shared/encryption";
import { LLMAdapter } from "@langfuse/shared";
import {
  DEFAULT_TOPIC_FACETS,
  topicProcessingConfigSchema,
} from "@langfuse/shared/topics";
import type { TopicsModel, TopicsModels } from "@langfuse/shared/topics/server";
import {
  nameTopicGroup,
  prepareTopicNamingGroup,
  summarizeTopicTraceFacets,
} from "./models";

/**
 * Topics LLM provider tests
 *
 * Real summary and naming calls through each provider, using the same prompt,
 * schema and parsing as processing. They assert that each call succeeds and
 * returns a parseable, non-empty result, never what the model wrote.
 *
 * Required environment variables (tests FAIL if not set), shared with
 * `src/__tests__/llmConnections.test.ts`:
 * - LANGFUSE_LLM_CONNECTION_OPENAI_KEY
 * - LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY
 * - LANGFUSE_LLM_CONNECTION_AZURE_KEY, _AZURE_BASE_URL, _AZURE_MODEL (Azure suite is currently skipped)
 * - LANGFUSE_LLM_CONNECTION_BEDROCK_ACCESS_KEY_ID, _BEDROCK_SECRET_ACCESS_KEY, _BEDROCK_REGION
 * - LANGFUSE_LLM_CONNECTION_BEDROCK_API_KEY
 * - LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY
 * - LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY
 *
 * Optional: LANGFUSE_LLM_CONNECTION_BEDROCK_GPT_MODEL, a Bedrock GPT-5.6+
 * model or inference profile available in the Bedrock region. Cached summary
 * prompts on those models use InvokeModel instead of Converse; the suite is
 * skipped without it.
 */

const TIMEOUT_MS = 120_000;
const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

type ProviderCase = {
  name: string;
  requiredEnv: string[];
  skip?: boolean;
  model: () => Omit<TopicsModel, "slot">;
};

const env = (name: string) => process.env[name]!;

const bedrockAccessKeys = () =>
  encrypt(
    JSON.stringify({
      accessKeyId: env("LANGFUSE_LLM_CONNECTION_BEDROCK_ACCESS_KEY_ID"),
      secretAccessKey: env("LANGFUSE_LLM_CONNECTION_BEDROCK_SECRET_ACCESS_KEY"),
    }),
  );
const bedrockAccessKeyEnv = [
  "LANGFUSE_LLM_CONNECTION_BEDROCK_ACCESS_KEY_ID",
  "LANGFUSE_LLM_CONNECTION_BEDROCK_SECRET_ACCESS_KEY",
  "LANGFUSE_LLM_CONNECTION_BEDROCK_REGION",
];

const providers: ProviderCase[] = [
  {
    name: "OpenAI",
    requiredEnv: ["LANGFUSE_LLM_CONNECTION_OPENAI_KEY"],
    model: () => ({
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      model: "gpt-5-mini",
      connection: {
        secretKey: encrypt(env("LANGFUSE_LLM_CONNECTION_OPENAI_KEY")),
      },
    }),
  },
  {
    name: "Anthropic",
    requiredEnv: ["LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY"],
    model: () => ({
      provider: "anthropic",
      adapter: LLMAdapter.Anthropic,
      model: "claude-sonnet-4-6",
      connection: {
        secretKey: encrypt(env("LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY")),
      },
    }),
  },
  {
    name: "Azure",
    // Skipped until CI has a valid Azure OpenAI key, like llmConnections.test.ts.
    skip: true,
    requiredEnv: [
      "LANGFUSE_LLM_CONNECTION_AZURE_KEY",
      "LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL",
      "LANGFUSE_LLM_CONNECTION_AZURE_MODEL",
    ],
    model: () => ({
      provider: "azure",
      adapter: LLMAdapter.Azure,
      model: env("LANGFUSE_LLM_CONNECTION_AZURE_MODEL"),
      connection: {
        secretKey: encrypt(env("LANGFUSE_LLM_CONNECTION_AZURE_KEY")),
        baseURL: env("LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL"),
      },
    }),
  },
  {
    name: "Bedrock",
    requiredEnv: bedrockAccessKeyEnv,
    model: () => ({
      provider: "bedrock",
      adapter: LLMAdapter.Bedrock,
      model: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
      connection: {
        secretKey: bedrockAccessKeys(),
        config: { region: env("LANGFUSE_LLM_CONNECTION_BEDROCK_REGION") },
      },
    }),
  },
  {
    name: "Bedrock (API Key)",
    requiredEnv: [
      "LANGFUSE_LLM_CONNECTION_BEDROCK_API_KEY",
      "LANGFUSE_LLM_CONNECTION_BEDROCK_REGION",
    ],
    model: () => ({
      provider: "bedrock",
      adapter: LLMAdapter.Bedrock,
      model: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
      connection: {
        secretKey: encrypt(
          JSON.stringify({
            apiKey: env("LANGFUSE_LLM_CONNECTION_BEDROCK_API_KEY"),
          }),
        ),
        config: { region: env("LANGFUSE_LLM_CONNECTION_BEDROCK_REGION") },
      },
    }),
  },
  {
    name: "Bedrock GPT (InvokeModel)",
    skip: !process.env.LANGFUSE_LLM_CONNECTION_BEDROCK_GPT_MODEL,
    requiredEnv: [
      ...bedrockAccessKeyEnv,
      "LANGFUSE_LLM_CONNECTION_BEDROCK_GPT_MODEL",
    ],
    model: () => ({
      provider: "bedrock",
      adapter: LLMAdapter.Bedrock,
      model: env("LANGFUSE_LLM_CONNECTION_BEDROCK_GPT_MODEL"),
      connection: {
        secretKey: bedrockAccessKeys(),
        config: { region: env("LANGFUSE_LLM_CONNECTION_BEDROCK_REGION") },
      },
    }),
  },
  {
    name: "VertexAI",
    requiredEnv: ["LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY"],
    model: () => ({
      provider: "google-vertex-ai",
      adapter: LLMAdapter.VertexAI,
      model: "gemini-2.5-flash-lite",
      connection: {
        secretKey: encrypt(env("LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY")),
        config: null,
      },
    }),
  },
  {
    name: "GoogleAIStudio",
    requiredEnv: ["LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY"],
    model: () => ({
      provider: "google-ai-studio",
      adapter: LLMAdapter.GoogleAIStudio,
      model: "gemini-3.1-flash-lite",
      connection: {
        secretKey: encrypt(env("LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY")),
      },
    }),
  },
];

function topicsModels(provider: ProviderCase): TopicsModels {
  const missing = provider.requiredEnv.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(
      `${missing.join(", ")} not set. This test calls ${provider.name} with real credentials. Set the environment variables to run it.`,
    );
  const model = provider.model();
  return {
    projectId: PROJECT_ID,
    enabled: true,
    summary: { ...model, slot: "summary" },
    // Embeddings are not called here; the slot only completes the type.
    embedding: { ...model, slot: "embedding", dimensions: 1024 },
    clustering: { ...model, slot: "clustering" },
  };
}

const facets = DEFAULT_TOPIC_FACETS.map(({ name, prompt }, index) => ({
  key: `${name.toLowerCase()}_${index + 1}`,
  facet: {
    projectId: PROJECT_ID,
    facetId: `facet-${index + 1}`,
    version: 1,
    prompt,
    createdAt: new Date(0).toISOString(),
  },
  builtIn: true,
}));

const transcript = `<run_facts>user messages: 2; assistant messages: 2; tool calls: 1; tool errors: 1</run_facts>
<this_run>
[user · request] My CSV export of last month's orders keeps timing out. Can you get it working?
[assistant → run_export #1] {"range":"last_month","format":"csv"}
[tool run_export #1 ←] ERROR: export timed out after 30s
[assistant] The full month timed out, so I split the export into four weekly files and attached them.
[user · request] Thanks, the weekly files opened fine.
[assistant] Glad that worked.
</this_run>
<end_of_run>assistant reply</end_of_run>`;

const namingMembers = [
  "Export last month's orders to CSV after the full export timed out.",
  "Export a quarter of invoices to CSV split into smaller files.",
  "Download the customer list as a spreadsheet after a failed export.",
  "Export order history to CSV grouped by region.",
].map((summary) => ({ summary }));

describe("Topics LLM provider tests", () => {
  for (const provider of providers) {
    (provider.skip ? describe.skip : describe)(provider.name, () => {
      test(
        "facet summarization returns every facet with a summary",
        async () => {
          const models = topicsModels(provider);

          const { output } = await summarizeTopicTraceFacets(
            models,
            facets,
            transcript,
            topicProcessingConfigSchema.parse({}),
          );

          const entries = output as Record<
            string,
            { summary: string; status: string }
          >;
          expect(Object.keys(entries).sort()).toEqual(
            facets.map(({ key }) => key).sort(),
          );
          expect(
            Object.values(entries).some(
              ({ summary }) => summary.trim().length > 0,
            ),
          ).toBe(true);
        },
        TIMEOUT_MS,
      );

      test(
        "cluster naming returns a name, description and evidence",
        async () => {
          const models = topicsModels(provider);
          const prepared = await prepareTopicNamingGroup(
            {
              members: [...namingMembers],
              contrasts: [
                {
                  id: "c1",
                  summary: "Translate a product description into German.",
                },
              ],
            },
            "topics-llm-provider-test",
          );

          const { output } = await nameTopicGroup(models, {
            ...prepared,
            facetName: "Intent",
          });

          expect(output.name.trim()).not.toBe("");
          expect(output.description.trim()).not.toBe("");
          expect(output.evidenceSummaryIds.length).toBeGreaterThan(0);
        },
        TIMEOUT_MS,
      );
    });
  }
});
