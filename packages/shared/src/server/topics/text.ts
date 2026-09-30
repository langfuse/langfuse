import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { generateText, Output, type ModelMessage } from "ai";
import { createRequire } from "node:module";
import { z } from "zod";
import {
  assertValidBedrockRegion,
  createDefaultBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";

export type TopicReasoningEffort = "none" | "low" | "medium" | "high";

function mantleProvider(region: string, profile?: string) {
  // Experiment only: borrow the SigV4 signer the AWS SDK clients already ship.
  const sdkRequire = createRequire(require.resolve("@aws-sdk/client-s3"));
  const { SignatureV4 } = sdkRequire("@smithy/signature-v4");
  const { Sha256 } = sdkRequire("@aws-crypto/sha256-js");
  const signer = new SignatureV4({
    credentials: fromNodeProviderChain(profile ? { profile } : {}),
    region,
    service: "bedrock-mantle",
    sha256: Sha256,
  });
  return createOpenAICompatible({
    name: "mantle",
    baseURL: `https://bedrock-mantle.${region}.api.aws/openai/v1`,
    supportsStructuredOutputs: true,
    includeUsage: true,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const signed = await signer.sign({
        method: init?.method ?? "POST",
        protocol: url.protocol,
        hostname: url.hostname,
        path: url.pathname,
        headers: { host: url.hostname, "content-type": "application/json" },
        body: init?.body,
      });
      return fetch(url, { ...init, headers: signed.headers });
    },
  });
}

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
    // Experiment: GPT-6 Luna returns reasoning as `redactedContent`, which the
    // SDK's Converse schema rejects; drop those blocks before parsing.
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (!response.ok) return response;
      const body = (await response.json()) as {
        output?: { message?: { content?: unknown[] } };
      };
      const content = body?.output?.message?.content;
      if (body.output?.message && Array.isArray(content))
        body.output.message.content = content.filter(
          (part) =>
            (part as { reasoningContent?: { redactedContent?: unknown } })
              .reasoningContent?.redactedContent === undefined,
        );
      return new Response(JSON.stringify(body), {
        status: response.status,
        headers: response.headers,
      });
    },
  });
  const reasoning = params.reasoning ?? "none";
  const common = {
    model: provider(params.model),
    allowSystemInMessages: true,
    maxOutputTokens: params.maxOutputTokens,
    maxRetries: 0,
    timeout: params.timeoutMs ?? 60_000,
  } as const;

  // Experiment: Gemma 4 is served only on the OpenAI-compatible bedrock-mantle endpoint.
  if (params.model.startsWith("google.gemma-")) {
    const result = await generateText({
      ...common,
      model: mantleProvider(params.region, params.profile).chatModel(
        params.model,
      ),
      messages: params.messages,
      output: Output.object({ schema: params.schema }),
      providerOptions:
        reasoning === "none" ? {} : { mantle: { reasoningEffort: reasoning } },
    });
    return { output: result.output, usage: result.usage };
  }

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
