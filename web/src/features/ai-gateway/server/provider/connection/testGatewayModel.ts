import { STATUS_CODES } from "node:http";

import { getBedrockModelApiFormats } from "@/src/features/ai-gateway/fns/getBedrockModelApiFormats";
import { isGeminiEmbeddingModel } from "@/src/features/ai-gateway/fns/isGeminiEmbeddingModel";
import { isOpenAiEmbeddingModel } from "@/src/features/ai-gateway/fns/isOpenAiEmbeddingModel";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import {
  type GatewayApiFormat,
  type GatewayProviderName,
  getGatewayUpstream,
  getGatewayUpstreamSecret,
} from "@/src/features/ai-gateway/server/provider/registry";

const TEST_TIMEOUT_MS = 15_000;
const MAX_ERROR_LENGTH = 300;
const BEDROCK_TEST_ORDER: GatewayApiFormat[] = [
  "anthropic.messages",
  "openai.chat-completions",
  "openai.responses",
];
const AZURE_TEST_ORDER: GatewayApiFormat[] = [
  "openai.responses",
  "openai.chat-completions",
  "openai.embeddings",
  "anthropic.messages",
];

export type GatewayModelTestResult =
  | { success: true; durationMs: number }
  | { success: false; status?: string; error: string };

/**
 * Sends a minimal request on each route the gateway would use for the model,
 * so a failure here predicts a failure for gateway traffic.
 */
export async function testGatewayModel(params: {
  provider: GatewayProviderName;
  config: unknown;
  baseURL: string | null;
  extraHeaders: Record<string, string>;
  credential: string;
  model: string;
  /** The formats the provider's catalog lists the model for. */
  reportedFormats?: readonly GatewayApiFormat[];
}): Promise<GatewayModelTestResult> {
  let firstFailure: GatewayModelTestResult | undefined;
  const apiFormats = getTestApiFormats(
    params.provider,
    params.model,
    params.reportedFormats,
  );
  for (const apiFormat of apiFormats) {
    const result = await sendTestRequest(params, apiFormat);
    if (result.success) return result;
    if (!firstFailure) firstFailure = result;
  }
  return firstFailure ?? { success: false, error: "No supported API format." };
}

async function sendTestRequest(
  params: Parameters<typeof testGatewayModel>[0],
  apiFormat: GatewayApiFormat,
): Promise<GatewayModelTestResult> {
  const { baseUrl, authType } = getGatewayUpstream({
    provider: params.provider,
    apiFormat,
    config: params.config,
    baseURL: params.baseURL,
    credential: params.credential,
  });
  let apiKey: string;
  try {
    apiKey = await getGatewayUpstreamSecret({
      provider: params.provider,
      credential: params.credential,
    });
  } catch {
    return {
      success: false,
      error: "The credential could not be exchanged for an access token.",
    };
  }
  const { path, body } = getTestRequest(apiFormat, params.model);
  const headers: Record<string, string> = {
    ...params.extraHeaders,
    "content-type": "application/json",
  };
  if (authType === "bearer") headers.authorization = `Bearer ${apiKey}`;
  if (authType === "x-api-key") headers["x-api-key"] = apiKey;
  if (apiFormat === "anthropic.messages") {
    headers["anthropic-version"] = "2023-06-01";
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    const fetcher = getGatewayFetch({
      baseURL: params.baseURL,
      extraHeaders: params.extraHeaders,
      logContext: "AI Gateway model test",
    });
    response = await fetcher(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
  } catch {
    return { success: false, error: "The provider could not be reached." };
  }
  if (response.ok) return { success: true, durationMs: Date.now() - startedAt };
  return {
    success: false,
    status:
      `${response.status} ${STATUS_CODES[response.status] ?? response.statusText}`.trim(),
    error: await readErrorMessage(response),
  };
}

// Bedrock models the gateway cannot classify, such as application inference
// profile ARNs, and Azure deployments, whose names are chosen freely, may serve
// any format, so each one is tried until one answers.
function getTestApiFormats(
  provider: GatewayProviderName,
  model: string,
  reportedFormats: readonly GatewayApiFormat[] | undefined,
): GatewayApiFormat[] {
  if (provider === "ANTHROPIC") return ["anthropic.messages"];
  if (provider === "OPENAI" && isOpenAiEmbeddingModel(model)) {
    return ["openai.embeddings"];
  }
  if (provider === "AZURE") return [...(reportedFormats ?? AZURE_TEST_ORDER)];
  if (provider === "GOOGLE_AI_STUDIO") {
    return isGeminiEmbeddingModel(model)
      ? ["openai.embeddings"]
      : ["openai.chat-completions"];
  }
  if (provider === "VERTEX") return ["openai.chat-completions"];
  if (provider === "OPENAI" || provider === "XAI") {
    return ["openai.responses", "openai.chat-completions"];
  }
  // Listed OpenRouter and Vercel models serve every format through one API,
  // except decision and embedding models, which serve only their own.
  if (provider === "OPENROUTER" || provider === "VERCEL") {
    if (reportedFormats?.includes("openai.decisions")) {
      return ["openai.decisions"];
    }
    if (reportedFormats?.includes("openai.embeddings")) {
      return ["openai.embeddings"];
    }
    return ["openai.chat-completions"];
  }
  const formats = getBedrockModelApiFormats(model);
  return BEDROCK_TEST_ORDER.filter((format) => formats.includes(format));
}

function getTestRequest(apiFormat: GatewayApiFormat, model: string) {
  const messages = [{ role: "user", content: "Hi" }];
  if (apiFormat === "anthropic.messages") {
    return { path: "/messages", body: { model, max_tokens: 1, messages } };
  }
  if (apiFormat === "openai.decisions") {
    return {
      path: "/decisions",
      body: {
        model,
        input: "Hi",
        questions: [
          {
            type: "predicate",
            name: "greeting",
            instructions: "Is this a greeting?",
          },
        ],
      },
    };
  }
  if (apiFormat === "openai.embeddings") {
    return { path: "/embeddings", body: { model, input: "Hi" } };
  }
  if (apiFormat === "openai.chat-completions") {
    return {
      path: "/chat/completions",
      body: { model, messages, max_tokens: 16 },
    };
  }
  return {
    path: "/responses",
    body: { model, input: "Hi", max_output_tokens: 16 },
  };
}

// OpenAI and Anthropic nest the message under `error` and Bedrock returns it at
// the top level. xAI sends `error` as the message itself, which is only used
// without a top-level `message`, where `error` is just a status name. Google AI
// Studio wraps the OpenAI shape in a one-element array.
async function readErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  let message = text;
  try {
    const parsed: unknown = JSON.parse(text);
    const body: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
    if (body && typeof body === "object") {
      const error = "error" in body ? body.error : undefined;
      if (error && typeof error === "object" && "message" in error) {
        message = String(error.message);
      } else if ("message" in body) {
        message = String(body.message);
      } else if (typeof error === "string" && error) {
        message = error;
      }
    }
  } catch {
    // Non-JSON bodies are shown as returned.
  }
  return message.trim().slice(0, MAX_ERROR_LENGTH) || response.statusText;
}
