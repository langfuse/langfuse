import { getBedrockModelApiFormats } from "@/src/features/ai-gateway/fns/getBedrockModelApiFormats";
import { decodeBedrockApiKey } from "@/src/features/ai-gateway/server/provider/bedrock";
import {
  type GatewayApiFormat,
  type GatewayProviderName,
  getGatewayUpstream,
} from "@/src/features/ai-gateway/server/provider/registry";

const TEST_TIMEOUT_MS = 15_000;
const MAX_ERROR_LENGTH = 300;

export type GatewayModelTestResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Sends one minimal request on the route the gateway would use for the model,
 * so a failure here predicts a failure for gateway traffic.
 */
export async function testGatewayModel(params: {
  provider: GatewayProviderName;
  config: unknown;
  credential: string;
  model: string;
  fetcher?: typeof fetch;
}): Promise<GatewayModelTestResult> {
  const apiFormat = getTestApiFormat(params.provider, params.model);
  const { baseUrl, authType } = getGatewayUpstream({
    provider: params.provider,
    apiFormat,
    config: params.config,
  });
  const apiKey =
    params.provider === "BEDROCK"
      ? decodeBedrockApiKey(params.credential)
      : params.credential;
  const { path, body } = getTestRequest(apiFormat, params.model);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (authType === "bearer") headers.authorization = `Bearer ${apiKey}`;
  if (authType === "x-api-key") headers["x-api-key"] = apiKey;
  if (apiFormat === "anthropic.messages") {
    headers["anthropic-version"] = "2023-06-01";
  }

  let response: Response;
  try {
    response = await (params.fetcher ?? fetch)(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
  } catch {
    return { success: false, error: "The provider could not be reached." };
  }
  if (response.ok) return { success: true };
  return {
    success: false,
    error: `${response.status}: ${await readErrorMessage(response)}`,
  };
}

function getTestApiFormat(
  provider: GatewayProviderName,
  model: string,
): GatewayApiFormat {
  if (provider === "ANTHROPIC") return "anthropic.messages";
  if (provider === "OPENAI") return "openai.responses";
  const formats = getBedrockModelApiFormats(model);
  if (formats.includes("anthropic.messages")) return "anthropic.messages";
  if (formats.includes("openai.chat-completions")) {
    return "openai.chat-completions";
  }
  return "openai.responses";
}

function getTestRequest(apiFormat: GatewayApiFormat, model: string) {
  const messages = [{ role: "user", content: "Hi" }];
  if (apiFormat === "anthropic.messages") {
    return { path: "/messages", body: { model, max_tokens: 1, messages } };
  }
  if (apiFormat === "openai.chat-completions") {
    return { path: "/chat/completions", body: { model, messages } };
  }
  return {
    path: "/responses",
    body: { model, input: "Hi", max_output_tokens: 16 },
  };
}

// OpenAI and Anthropic nest the message under `error`; Bedrock returns it at the top level.
async function readErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  let message = text;
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object") {
      const error = "error" in body ? body.error : undefined;
      if (error && typeof error === "object" && "message" in error) {
        message = String(error.message);
      } else if ("message" in body) {
        message = String(body.message);
      }
    }
  } catch {
    // Non-JSON bodies are shown as returned.
  }
  return message.trim().slice(0, MAX_ERROR_LENGTH) || response.statusText;
}
