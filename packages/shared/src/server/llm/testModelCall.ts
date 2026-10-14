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

const TEST_MODEL_CALL_MAX_OUTPUT_TOKENS = 1_024;

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
  const promptSchema =
    schema instanceof Object && "~standard" in schema
      ? z.toJSONSchema(schema as ZodType)
      : schema;

  const completionParams = mapLegacyLLMCompletionParams({
    connection: apiKey,
    messages: [
      {
        role: ChatMessageRole.User,
        content: `Generate one example response that conforms to this JSON schema. Respect the type, description, allowed values, and bounds of every field. Keep any reasoning brief.

JSON schema:
${JSON.stringify(promptSchema)}`,
        type: ChatMessageType.User,
      },
    ],
    modelParams: {
      provider,
      model,
      adapter: apiKey.adapter,
      ...modelConfig,
    },
  });

  const result = await generateLLMText({
    ...completionParams,
    maxOutputTokens: Math.min(
      completionParams.maxOutputTokens ?? TEST_MODEL_CALL_MAX_OUTPUT_TOKENS,
      TEST_MODEL_CALL_MAX_OUTPUT_TOKENS,
    ),
    output: createLLMOutput(schema),
    timeout,
  });

  // Accessing output makes the AI SDK validate that structured output exists.
  const { output: _output } = result;
};
