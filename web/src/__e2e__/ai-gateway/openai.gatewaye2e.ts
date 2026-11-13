import { describe, expect, it } from "vitest";

import { GatewayResolveResponseSchema } from "@/src/features/ai-gateway/server/provider/registry";
import { GatewayProvider } from "@langfuse/shared/src/db";
import {
  COMPLETION_TIMEOUT_MS,
  completeAndExpectIngested,
  expectGatewayError,
  gatewayControlPlaneRequest,
  gatewayModelSlug,
  ingestTrace,
  listGatewayModelIds,
  ORGANIZATION_ID,
  missingLocalEnv,
  requiredEnv,
  setUpGatewayE2e,
  TEST_TIMEOUT_MS,
  withGatewayApiKey,
} from "./gatewayE2eHarness";

// Requests name unprefixed provider model ids, which resolve while this is the
// only enabled connection.
const COMPLETIONS = [
  {
    apiFormat: "openai.responses",
    model: "gpt-6-sol",
    path: "/openai/v1/responses",
    body: {
      model: "gpt-6-sol",
      input: "Reply with the word hello.",
      max_output_tokens: 32,
    },
  },
  {
    apiFormat: "openai.chat-completions",
    model: "gpt-6-sol",
    path: "/openai/v1/chat/completions",
    body: {
      model: "gpt-6-sol",
      messages: [{ role: "user", content: "Reply with the word hello." }],
      max_completion_tokens: 32,
    },
  },
  {
    apiFormat: "openai.decisions",
    model: "gpt-6-luna",
    path: "/openai/v1/decisions",
    body: {
      model: "gpt-6-luna",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: "The sky is green." }],
        },
      ],
      questions: [
        {
          type: "predicate",
          name: "is_false",
          instructions: "Is the statement false?",
        },
      ],
    },
  },
  {
    apiFormat: "openai.embeddings",
    model: "text-embedding-3-small",
    path: "/openai/v1/embeddings",
    body: {
      model: "text-embedding-3-small",
      input: "Reply with the word hello.",
    },
  },
] as const;

const UNAUTHENTICATED_REQUESTS = [
  {
    path: "/openai/v1/responses",
    body: { model: "gpt-6-sol", input: "hello" },
    error: {
      error: {
        message: "Invalid gateway credential",
        type: "authentication_error",
        param: null,
        code: "invalid_api_key",
      },
    },
  },
  {
    path: "/anthropic/v1/messages",
    body: {
      model: "claude-opus-5-5",
      max_tokens: 8,
      messages: [{ role: "user", content: "hello" }],
    },
    error: {
      type: "error",
      error: {
        type: "authentication_error",
        message: "Invalid gateway credential",
      },
    },
  },
] as const;

const skip = missingLocalEnv("LANGFUSE_LLM_CONNECTION_OPENAI_KEY");

describe.skipIf(skip)("AI gateway OpenAI end-to-end", () => {
  const suite = setUpGatewayE2e(() => ({
    provider: GatewayProvider.OPENAI,
    credential: requiredEnv("LANGFUSE_LLM_CONNECTION_OPENAI_KEY"),
    models: COMPLETIONS.map(({ model }) => model),
  }));

  it(
    "lists the connection's models",
    async () => {
      await withGatewayApiKey("openai.responses", async ({ secretKey }) => {
        const models = await listGatewayModelIds(secretKey, "openai.responses");
        for (const { model } of COMPLETIONS) {
          expect(models).toContain(gatewayModelSlug(model));
        }
      });
    },
    TEST_TIMEOUT_MS,
  );

  it.each(COMPLETIONS)(
    "$apiFormat completes $model and is ingested with cost",
    async ({ apiFormat, model, path, body }) => {
      await withGatewayApiKey(apiFormat, async ({ secretKey }) => {
        await completeAndExpectIngested({
          secretKey,
          apiFormat,
          path,
          body,
          providerModel: model,
        });
      });
    },
    COMPLETION_TIMEOUT_MS,
  );

  it("rejects an unknown model", async () => {
    await withGatewayApiKey("openai.responses", async ({ secretKey }) => {
      const response = await fetch(
        `${suite.gatewayBaseUrl}/openai/v1/responses`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "not-a-gateway-model",
            input: "hello",
          }),
        },
      );
      await expectGatewayError(response, 400, {
        error: {
          message: "Invalid gateway model",
          type: "invalid_request_error",
          param: null,
          code: "invalid_model",
        },
      });
    });
  });

  it.each(UNAUTHENTICATED_REQUESTS)(
    "POST $path without a credential is rejected",
    async ({ path, body, error }) => {
      const response = await fetch(`${suite.gatewayBaseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await expectGatewayError(response, 401, error);
    },
  );

  // The gateway never accepts a client span, so project spoofing stays a direct
  // resolve plus OTLP upload. One provider is enough: ingestion ignores the span
  // project the same way for every provider.
  it(
    "ignores a spoofed project id on a resolved span",
    async () => {
      const apiFormat = "openai.responses";
      const { connection, admin } = suite;
      await withGatewayApiKey(apiFormat, async ({ secretKey, id: keyId }) => {
        const resolved = GatewayResolveResponseSchema.parse(
          await gatewayControlPlaneRequest({
            apiFormat,
            virtualSecretKey: secretKey,
            model: gatewayModelSlug("ai-gateway-e2e"),
          }),
        );

        expect(resolved.connection.api_format).toBe(apiFormat);
        expect(resolved.connection.base_url).toBe("https://api.openai.com/v1");
        expect(resolved.connection.auth).toMatchObject({
          type: "Bearer",
          token: expect.stringMatching(/\S/),
        });
        expect(resolved.attribution).toEqual({
          organization_id: ORGANIZATION_ID,
          project_id: expect.stringMatching(/\S/),
          key_id: keyId,
          user_id: admin.userId,
          key_name: `Gateway E2E ${connection.provider} ${apiFormat}`,
          user_name: admin.userName || null,
          user_email: admin.userEmail || null,
          key_metadata: {
            test: true,
            provider: connection.provider,
            apiFormat,
          },
          provider_connection_id: connection.id,
        });
        expect(resolved.ingestion).toMatchObject({
          access_token: expect.stringMatching(/\S/),
          token_type: "Bearer",
          expires_at: expect.any(Number),
        });

        await ingestTrace(resolved.ingestion!.access_token, apiFormat);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
