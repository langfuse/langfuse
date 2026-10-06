import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { generateText, Output, type ModelMessage } from "ai";
import type { z } from "zod";
import {
  assertValidBedrockRegion,
  createDefaultBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";
import { createAiSdkTelemetryCapture } from "../llm/ai-sdk/telemetry";
import type { TraceSinkParams } from "../llm/types";

/** Uses the shared AI SDK and AWS credentials for Topics structured text. */
export async function generateTopicText<T>(params: {
  model: string;
  messages: ModelMessage[];
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  region: string;
  profile?: string;
  trace?: TraceSinkParams;
}) {
  assertValidBedrockRegion(params.region);
  const provider = createAmazonBedrock({
    region: params.region,
    ...createDefaultBedrockProviderAuth({ profile: params.profile }),
  });
  const capture = params.trace
    ? createAiSdkTelemetryCapture({
        traceSinkParams: params.trace,
        rootInput: params.messages,
      })
    : undefined;

  const generate = () =>
    generateText({
      model: provider(params.model),
      messages: params.messages,
      allowSystemInMessages: true,
      output: Output.object({ schema: params.schema }),
      maxOutputTokens: params.maxOutputTokens,
      providerOptions: {
        bedrock: {
          additionalModelRequestFields: { reasoning: { effort: "none" } },
        },
      },
      maxRetries: 0,
      timeout: 60_000,
      ...(capture ? { telemetry: capture.telemetry } : {}),
    });

  try {
    const result = await (capture ? capture.run(generate) : generate());
    capture?.setRootOutput(result.output);
    return result;
  } catch (error) {
    capture?.setRootError(error);
    throw error;
  } finally {
    await capture?.flush();
  }
}
