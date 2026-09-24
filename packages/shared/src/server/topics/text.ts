import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { generateText, Output, type ModelMessage } from "ai";
import type { z } from "zod";
import {
  assertValidBedrockRegion,
  createDefaultBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";

/** Uses the shared AI SDK and AWS credentials for Topics structured text. */
export async function generateTopicText<T>(params: {
  model: string;
  messages: ModelMessage[];
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  region: string;
  profile?: string;
}) {
  assertValidBedrockRegion(params.region);
  const provider = createAmazonBedrock({
    region: params.region,
    ...createDefaultBedrockProviderAuth({ profile: params.profile }),
  });
  return generateText({
    model: provider(params.model),
    messages: params.messages,
    allowSystemInMessages: true,
    output: Output.object({ schema: params.schema }),
    maxOutputTokens: params.maxOutputTokens,
    providerOptions: {
      bedrock: {
        additionalModelRequestFields: { reasoning_effort: "none" },
      },
    },
    maxRetries: 0,
    timeout: 60_000,
  });
}
