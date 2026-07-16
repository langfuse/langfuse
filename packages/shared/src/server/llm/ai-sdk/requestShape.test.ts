import { afterEach, describe, expect, it, vi } from "vitest";

import { encrypt } from "../../../encryption";
import {
  type ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
  type ModelParams,
} from "../types";
import {
  createLLMOutput,
  generateLLMText,
  mapLegacyLLMCompletionParams,
} from "../llmText";

// Request-shape coverage exercises the real provider packages while replacing
// the separately tested secure transport with a capture fetch.
vi.mock("../secureLlmFetch", () => ({
  createSecureLlmFetch: () => globalThis.fetch,
}));

// The Vertex provider exchanges service-account credentials for an OAuth
// token via google-auth-library before issuing the model request; both the
// provider and our vertex builder resolve to the same library copy, so this
// mock covers token generation and the ADC project lookup.
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    getClient = async () => ({
      getAccessToken: async () => ({ token: "fake-gcp-token" }),
    });
    getProjectId = async () => "adc-project";
  },
}));

const messages: ChatMessage[] = [
  {
    type: ChatMessageType.System,
    role: ChatMessageRole.System,
    content: "You are terse.",
  },
  { type: ChatMessageType.User, role: ChatMessageRole.User, content: "Hi" },
];

type CapturedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown>;
};

/**
 * Fetch stub that records every outgoing request and answers with a canned
 * provider response, so the assertion target is the exact wire format the AI
 * SDK provider constructs (URL, auth header, JSON body).
 */
function createCaptureFetch(response: unknown) {
  const calls: CapturedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: JSON.parse(await request.text()) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetch: fetchImpl };
}

const OPENAI_CHAT_RESPONSE = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1,
  model: "gpt-4o",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "ok" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

const OPENAI_RESPONSES_RESPONSE = {
  id: "resp_1",
  object: "response",
  created_at: 1,
  status: "completed",
  error: null,
  incomplete_details: null,
  model: "gpt-4o",
  output: [
    {
      type: "message",
      id: "msg_1",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: "ok", annotations: [] }],
    },
  ],
  usage: {
    input_tokens: 1,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 1,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 2,
  },
};

const ANTHROPIC_RESPONSE = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5",
  content: [{ type: "text", text: "ok" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
};

const GOOGLE_RESPONSE = {
  candidates: [
    {
      content: { role: "model", parts: [{ text: "ok" }] },
      finishReason: "STOP",
    },
  ],
  usageMetadata: {
    promptTokenCount: 1,
    candidatesTokenCount: 1,
    totalTokenCount: 2,
  },
};

const BEDROCK_RESPONSE = {
  output: { message: { role: "assistant", content: [{ text: "ok" }] } },
  stopReason: "end_turn",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  metrics: { latencyMs: 1 },
};

const FAKE_GCP_SERVICE_ACCOUNT_KEY = JSON.stringify({
  type: "service_account",
  project_id: "sa-project-123",
  private_key_id: "key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
  client_email: "svc@sa-project-123.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://example.com/cert",
});

async function runCompletion(params: {
  modelParams: ModelParams;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  llmConnectionConfig?: Record<string, string | boolean>;
  output?: ReturnType<typeof createLLMOutput>;
  response: unknown;
}) {
  const { calls, fetch } = createCaptureFetch(params.response);
  vi.stubGlobal("fetch", fetch);
  const result = await generateLLMText({
    ...mapLegacyLLMCompletionParams({
      messages,
      modelParams: params.modelParams,
      connection: {
        secretKey: encrypt(params.apiKey),
        baseURL: params.baseURL,
        extraHeaders: params.extraHeaders
          ? encrypt(JSON.stringify(params.extraHeaders))
          : undefined,
        config: params.llmConnectionConfig,
      },
    }),
    timeout: 10_000,
    output: params.output,
  });

  expect(calls).toHaveLength(1);
  return { result, request: calls[0] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AI SDK request shapes", () => {
  it("OpenAI chat completions: default URL, bearer auth, translated body params", async () => {
    const { result, request } = await runCompletion({
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "gpt-4o",
        max_tokens: 128,
        temperature: 0.2,
        providerOptions: { reasoning_effort: "high" },
      },
      apiKey: "sk-test",
      response: OPENAI_CHAT_RESPONSE,
    });

    expect(result.text).toBe("ok");
    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.headers.get("authorization")).toBe("Bearer sk-test");
    expect(request.body.model).toBe("gpt-4o");
    expect(request.body.reasoning_effort).toBe("high");
    expect(request.body.temperature).toBe(0.2);
    expect(request.body.max_tokens).toBe(128);
    expect(request.body.messages).toEqual([
      { role: "system", content: "You are terse." },
      { role: "user", content: "Hi" },
    ]);
  });

  it("OpenAI responses mode: /v1/responses when useResponsesApi is set", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "gpt-4o",
      },
      apiKey: "sk-test",
      llmConnectionConfig: { useResponsesApi: true },
      response: OPENAI_RESPONSES_RESPONSE,
    });

    expect(request.url).toBe("https://api.openai.com/v1/responses");
    expect(request.headers.get("authorization")).toBe("Bearer sk-test");
    expect(request.body.model).toBe("gpt-4o");
  });

  it("OpenAI-compatible chat completions: preserves custom provider options on the wire", async () => {
    const { result, request } = await runCompletion({
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "custom-reasoning-model",
        max_tokens: 64,
        providerOptions: {
          reasoning_effort: "high",
          service_tier: "flex",
          parallel_tool_calls: false,
          logit_bias: { "42": 1 },
          thinkingBudget: 1024,
          thinkingLevel: "high",
        },
      },
      apiKey: "custom-key",
      baseURL: "https://openai-compatible.example.com/v1",
      response: OPENAI_CHAT_RESPONSE,
    });

    expect(result.text).toBe("ok");
    expect(request.url).toBe(
      "https://openai-compatible.example.com/v1/chat/completions",
    );
    expect(request.headers.get("authorization")).toBe("Bearer custom-key");
    expect(request.body.model).toBe("custom-reasoning-model");
    expect(request.body.max_tokens).toBe(64);
    expect(request.body.reasoning_effort).toBe("high");
    expect(request.body.service_tier).toBe("flex");
    expect(request.body.parallel_tool_calls).toBe(false);
    expect(request.body.logit_bias).toEqual({ "42": 1 });
    expect(request.body.serviceTier).toBeUndefined();
    expect(request.body.parallelToolCalls).toBeUndefined();
    expect(request.body.logitBias).toBeUndefined();
    expect(request.body.thinkingBudget).toBe(1024);
    expect(request.body.thinkingLevel).toBe("high");
  });

  it("OpenAI-compatible chat completions: preserves JSON schema response_format", async () => {
    const { result, request } = await runCompletion({
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "custom-schema-model",
      },
      apiKey: "custom-key",
      baseURL: "https://openai-compatible.example.com/v1",
      output: createLLMOutput({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
        additionalProperties: false,
      }),
      response: {
        ...OPENAI_CHAT_RESPONSE,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: '{"answer":"ok"}' },
            finish_reason: "stop",
          },
        ],
      },
    });

    expect(result.output).toEqual({ answer: "ok" });
    expect(request.body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        strict: true,
        name: "response",
        schema: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
          additionalProperties: false,
        },
      },
    });
  });

  it("Azure: stored deployment URL with pinned api-version and api-key header", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "azure",
        adapter: LLMAdapter.Azure,
        model: "gpt4o-deployment",
        max_tokens: 64,
        providerOptions: { logit_bias: { "42": 1 } },
      },
      apiKey: "azure-key",
      baseURL: "https://my-instance.openai.azure.com/openai/deployments",
      extraHeaders: { "x-custom": "1" },
      response: OPENAI_CHAT_RESPONSE,
    });

    expect(request.url).toBe(
      "https://my-instance.openai.azure.com/openai/deployments/gpt4o-deployment/chat/completions?api-version=2025-02-01-preview",
    );
    expect(request.headers.get("api-key")).toBe("azure-key");
    expect(request.headers.get("x-custom")).toBe("1");
    expect(request.body.logit_bias).toEqual({ "42": 1 });
    expect(request.body.max_tokens).toBe(64);
  });

  it("Azure: deployment-specific stored URL is normalized before request construction", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "azure",
        adapter: LLMAdapter.Azure,
        model: "gpt4o-deployment",
        max_tokens: 64,
      },
      apiKey: "azure-key",
      baseURL:
        "https://my-instance.openai.azure.com/openai/deployments/gpt4o-deployment",
      response: OPENAI_CHAT_RESPONSE,
    });

    expect(request.url).toBe(
      "https://my-instance.openai.azure.com/openai/deployments/gpt4o-deployment/chat/completions?api-version=2025-02-01-preview",
    );
    expect(request.headers.get("api-key")).toBe("azure-key");
  });

  it("OpenAI chat completions: gpt-5.4 mini uses portable non-reasoning settings", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "gpt-5.4-mini",
        max_tokens: 64,
        temperature: 0.2,
        top_p: 0.9,
      },
      apiKey: "openai-key",
      response: OPENAI_CHAT_RESPONSE,
    });

    expect(request.body.max_tokens).toBeUndefined();
    expect(request.body.max_completion_tokens).toBe(64);
    expect(request.body.temperature).toBe(0.2);
    expect(request.body.top_p).toBe(0.9);
    expect(request.body.reasoning_effort).toBe("none");
    expect(request.body.forceReasoning).toBeUndefined();
  });

  it("OpenAI-compatible chat completions: gpt-5.4 mini does not leak internal reasoning controls", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "gpt-5.4-mini",
        max_tokens: 64,
        temperature: 0.2,
        top_p: 0.9,
      },
      apiKey: "custom-key",
      baseURL: "https://openai-compatible.example.com/v1",
      response: OPENAI_CHAT_RESPONSE,
    });

    expect(request.body.max_tokens).toBe(64);
    expect(request.body.temperature).toBe(0.2);
    expect(request.body.top_p).toBe(0.9);
    expect(request.body.forceReasoning).toBeUndefined();
  });

  it("OpenAI-compatible chat completions: explicit gpt-5.4 mini reasoning remains a wire setting", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "gpt-5.4-mini",
        providerOptions: { reasoning_effort: "high" },
      },
      apiKey: "custom-key",
      baseURL: "https://openai-compatible.example.com/v1",
      response: OPENAI_CHAT_RESPONSE,
    });

    expect(request.body.reasoning_effort).toBe("high");
    expect(request.body.forceReasoning).toBeUndefined();
  });

  it("Anthropic: /v1/messages on a custom origin with snake_case thinking body", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "anthropic",
        adapter: LLMAdapter.Anthropic,
        model: "claude-sonnet-5",
        max_tokens: 256,
        providerOptions: { thinking: { type: "enabled", budget_tokens: 1024 } },
      },
      apiKey: "anthropic-key",
      baseURL: "https://anthropic-proxy.example.com",
      response: ANTHROPIC_RESPONSE,
    });

    expect(request.url).toBe("https://anthropic-proxy.example.com/v1/messages");
    expect(request.headers.get("x-api-key")).toBe("anthropic-key");
    expect(request.headers.get("anthropic-version")).toBeTruthy();
    expect(request.body.model).toBe("claude-sonnet-5");
    // With thinking enabled, the budget counts toward Anthropic's max_tokens,
    // so the provider adds maxOutputTokens and budgetTokens.
    expect(request.body.max_tokens).toBe(256 + 1024);
    expect(request.body.thinking).toEqual({
      type: "enabled",
      budget_tokens: 1024,
    });
    // The leading system message becomes the top-level system param.
    expect(JSON.stringify(request.body.system)).toContain("You are terse.");
    expect(request.body.messages).toHaveLength(1);
  });

  it("Google AI Studio: /v1beta path on a custom origin with thinkingConfig", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "google-ai-studio",
        adapter: LLMAdapter.GoogleAIStudio,
        model: "gemini-2.5-flash",
        providerOptions: { thinkingBudget: 512 },
      },
      apiKey: "google-key",
      baseURL: "https://google-proxy.example.com",
      response: GOOGLE_RESPONSE,
    });

    expect(request.url).toBe(
      "https://google-proxy.example.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(request.headers.get("x-goog-api-key")).toBe("google-key");
    const generationConfig = request.body.generationConfig as Record<
      string,
      unknown
    >;
    expect(generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 512,
      includeThoughts: true,
    });
  });

  it("Vertex Gemini: regional host, SA-key project, OAuth bearer, maxReasoningTokens", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "vertex",
        adapter: LLMAdapter.VertexAI,
        model: "gemini-2.5-flash",
        maxReasoningTokens: 2048,
      },
      apiKey: FAKE_GCP_SERVICE_ACCOUNT_KEY,
      llmConnectionConfig: { location: "us-east5" },
      response: GOOGLE_RESPONSE,
    });

    // The Google Vertex provider targets the v1beta1 generateContent API.
    expect(request.url).toBe(
      "https://us-east5-aiplatform.googleapis.com/v1beta1/projects/sa-project-123/locations/us-east5/publishers/google/models/gemini-2.5-flash:generateContent",
    );
    expect(request.headers.get("authorization")).toBe("Bearer fake-gcp-token");
    const generationConfig = request.body.generationConfig as Record<
      string,
      unknown
    >;
    expect(generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 2048,
      includeThoughts: true,
    });
  });

  it("Vertex Claude: anthropic publisher rawPredict URL with vertex anthropic_version", async () => {
    const { request } = await runCompletion({
      modelParams: {
        provider: "vertex",
        adapter: LLMAdapter.VertexAI,
        model: "claude-sonnet-4-5@20250929",
        max_tokens: 128,
      },
      apiKey: FAKE_GCP_SERVICE_ACCOUNT_KEY,
      llmConnectionConfig: { location: "us-east5" },
      response: ANTHROPIC_RESPONSE,
    });

    expect(decodeURIComponent(request.url)).toBe(
      "https://us-east5-aiplatform.googleapis.com/v1/projects/sa-project-123/locations/us-east5/publishers/anthropic/models/claude-sonnet-4-5@20250929:rawPredict",
    );
    expect(request.headers.get("authorization")).toBe("Bearer fake-gcp-token");
    // Vertex mode: the version moves into the body and the model into the URL.
    expect(request.body.anthropic_version).toBeTruthy();
    expect(request.body.model).toBeUndefined();
    expect(request.body.max_tokens).toBe(128);
  });

  // The Bedrock builder deliberately uses no custom fetch (VPC endpoints),
  // so capture at the global fetch the AI SDK falls back to.
  async function runBedrockCompletion() {
    const modelParams: ModelParams = {
      provider: "bedrock",
      adapter: LLMAdapter.Bedrock,
      model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      max_tokens: 64,
      providerOptions: { top_k: 10 },
    };
    const llmConnectionConfig = { region: "us-east-1" };

    const { calls, fetch } = createCaptureFetch(BEDROCK_RESPONSE);
    vi.stubGlobal("fetch", fetch);

    const result = await generateLLMText({
      ...mapLegacyLLMCompletionParams({
        messages,
        modelParams,
        connection: {
          secretKey: encrypt(
            JSON.stringify({
              accessKeyId: "AKIA123",
              secretAccessKey: "secret",
            }),
          ),
          config: llmConnectionConfig,
        },
      }),
      timeout: 10_000,
    });

    expect(result.text).toBe("ok");
    expect(calls).toHaveLength(1);
    return calls[0];
  }

  it("Bedrock: converse URL from validated region, SigV4 auth, verbatim additional fields", async () => {
    const request = await runBedrockCompletion();

    expect(decodeURIComponent(request.url)).toBe(
      "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-sonnet-20241022-v2:0/converse",
    );
    expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);
    expect(request.body.additionalModelRequestFields).toEqual({ top_k: 10 });
    expect(request.body.inferenceConfig).toMatchObject({ maxTokens: 64 });
  });

  it("Bedrock: tenant credentials suppress server-level env auth fallbacks", async () => {
    // A self-hosted operator may set these for their own purposes; tenant
    // connections must never authenticate with them. Unsuppressed, the
    // provider's AWS_BEARER_TOKEN_BEDROCK fallback wins over the tenant's
    // access keys entirely (requests would run under the SERVER identity).
    vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "server-bearer-token");
    vi.stubEnv("AWS_SESSION_TOKEN", "server-session-token");

    const request = await runBedrockCompletion();

    // SigV4 with the tenant keys — not `Bearer server-bearer-token`.
    expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);
    expect(request.headers.get("authorization")).toContain("AKIA123");
    // No merged server session token (would surface as this SigV4 header).
    expect(request.headers.get("x-amz-security-token")).toBeNull();
  });
});
