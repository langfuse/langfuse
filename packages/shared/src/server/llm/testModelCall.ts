import {
  ChatMessageRole,
  ChatMessageType,
  LLMApiKeySchema,
  type ModelConfig,
} from "./types";
import { fetchLLMCompletion } from "./fetchLLMCompletion";
import z from "zod";

type StructuredOutputSchema = NonNullable<
  Parameters<typeof fetchLLMCompletion>[0]["structuredOutputSchema"]
>;

export const testModelCall = async ({
  provider,
  model,
  apiKey,
  modelConfig,
  structuredOutputSchema,
}: {
  provider: string;
  model: string;
  apiKey: z.infer<typeof LLMApiKeySchema>;
  modelConfig?: ModelConfig | null;
  structuredOutputSchema?: StructuredOutputSchema;
}) => {
  await fetchLLMCompletion({
    streaming: false,
    llmConnection: apiKey,
    messages: [
      {
        role: ChatMessageRole.User,
        content:
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
    structuredOutputSchema:
      structuredOutputSchema ??
      z.object({
        score: z.string(),
        reasoning: z.string(),
      }),
  });
};
