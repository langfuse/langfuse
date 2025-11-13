import { z as zodV3 } from "zod/v3";
import {
  ChatMessageRole,
  ChatMessageType,
  LLMApiKeySchema,
  type ModelConfig,
} from "./types";
import { fetchLLMCompletion } from "./fetchLLMCompletion";
import z from "zod/v4";

export const testModelCall = async ({
  provider,
  model,
  apiKey,
  prompt,
  modelConfig,
}: {
  provider: string;
  model: string;
  apiKey: z.infer<typeof LLMApiKeySchema>;
  prompt?: string;
  modelConfig?: ModelConfig | null;
}) => {
  await fetchLLMCompletion({
    streaming: false,
    llmConnection: apiKey,
    messages: [
      {
        role: ChatMessageRole.User,
        content:
          prompt ??
          'Extract a score (1-5) and reasoning from this text: "This is a test. It worked perfectly because it matched all passing criteria."',
        type: ChatMessageType.User,
      },
    ],
    modelParams: {
      provider: provider,
      model: model,
      adapter: apiKey.adapter,
      ...modelConfig,
    },
    structuredOutputSchema: zodV3.object({
      score: zodV3.string(),
      reasoning: zodV3.string(),
    }),
  });
};
