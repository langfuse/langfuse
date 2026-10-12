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
  timeout,
}: {
  provider: string;
  model: string;
  apiKey: z.infer<typeof LLMApiKeySchema>;
  modelConfig?: ModelConfig | null;
  structuredOutputSchema?: StructuredOutputSchema;
  timeout?: number;
}) => {
  const schema =
    structuredOutputSchema ??
    z.object({
      score: z.string(),
      reasoning: z.string(),
    });

  const result = await generateLLMText({
    ...mapLegacyLLMCompletionParams({
      connection: apiKey,
      messages: [
        {
          role: ChatMessageRole.User,
          content:
            "Generate one example response that conforms to the provided JSON schema. Respect the type, allowed values, and bounds of every field. Keep any reasoning brief.",
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
    timeout,
  });

  // Accessing output makes the AI SDK validate that structured output exists.
  const { output: _output } = result;
};
