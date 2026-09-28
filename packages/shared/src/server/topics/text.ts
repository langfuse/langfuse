import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { generateText, Output, type ModelMessage } from "ai";
import { z } from "zod";
import {
  assertValidBedrockRegion,
  createDefaultBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";

export type TopicReasoningEffort = "none" | "low" | "medium" | "high";

/**
 * Uses the shared AI SDK and AWS credentials for Topics structured text.
 *
 * OpenAI models take `reasoning.effort`; Bedrock caches their prompts only on
 * exact repeats. Anthropic models get an explicit cache point after the system
 * message, so the static system prompt is shared across traces.
 */
export async function generateTopicText<T>(params: {
  model: string;
  messages: ModelMessage[];
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  region: string;
  profile?: string;
  reasoning?: TopicReasoningEffort;
  timeoutMs?: number;
}) {
  assertValidBedrockRegion(params.region);
  const provider = createAmazonBedrock({
    region: params.region,
    ...createDefaultBedrockProviderAuth({ profile: params.profile }),
  });
  const reasoning = params.reasoning ?? "none";
  const common = {
    model: provider(params.model),
    allowSystemInMessages: true,
    maxOutputTokens: params.maxOutputTokens,
    maxRetries: 0,
    timeout: params.timeoutMs ?? 60_000,
  } as const;

  if (!params.model.includes("anthropic.")) {
    const result = await generateText({
      ...common,
      messages: params.messages,
      output: Output.object({ schema: params.schema }),
      providerOptions: {
        bedrock: {
          additionalModelRequestFields: { reasoning: { effort: reasoning } },
        },
      },
    });
    return { output: result.output, usage: result.usage };
  }

  // Anthropic models return prompt-instructed JSON: the SDK's forced JSON tool
  // suppresses thinking and, for nested schemas, Claude Sonnet 5 leaks
  // parameter markup into the tool input; Bedrock rejects its native format.
  const thinking = reasoning !== "none";
  const messages = params.messages.map((message) =>
    message.role === "system"
      ? {
          ...message,
          content: `${message.content}\n\nRespond with only a JSON object that matches this JSON schema, with no prose and no code fences:\n${JSON.stringify(z.toJSONSchema(params.schema))}`,
          providerOptions: { bedrock: { cachePoint: { type: "default" } } },
        }
      : message,
  );
  const result = await generateText({
    ...common,
    messages,
    providerOptions: {
      bedrock: {
        reasoningConfig: thinking
          ? { type: "adaptive", maxReasoningEffort: reasoning }
          : { type: "disabled" },
      },
    },
  });
  const json = result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return { output: params.schema.parse(JSON.parse(json)), usage: result.usage };
}
