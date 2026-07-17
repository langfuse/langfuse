import {
  ChatMessageRole,
  ChatMessageType,
  LLMApiKeySchema,
  type LLMJSONSchema,
  type ModelConfig,
} from "./types";
import {
  createLLMOutput,
  generateLLMText,
  mapLegacyLLMCompletionParams,
} from "./llmText";
import z, { type ZodType } from "zod";

type StructuredOutputSchema = ZodType | LLMJSONSchema;

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
  const schema =
    structuredOutputSchema ??
    z.object({
      score: z.string(),
      reasoning: z.string(),
    });

  await generateLLMText({
    ...mapLegacyLLMCompletionParams({
      connection: apiKey,
      messages: [
        {
          role: ChatMessageRole.User,
          content:
            'Extract a score (1-5) and reasoning from this text: "This is a test. It worked perfectly because it matched all passing criteria."',
          type: ChatMessageType.User,
        },
      ],
      modelParams: {
        provider,
        model,
        adapter: apiKey.adapter,
        ...modelConfig,
      },
    }),
    output: createLLMOutput(schema),
  });
};
