import { describe, expect, it } from "vitest";
import { getObservationByIdFromEventsTable } from "@langfuse/shared/src/server";
import waitForExpect from "wait-for-expect";

import { GatewayResolveResponseSchema } from "@/src/features/ai-gateway/server/provider/registry";
import {
  GatewayProvider,
  GatewaySpendLimitInterval,
} from "@langfuse/shared/src/db";
import {
  COMPLETION_TIMEOUT_MS,
  completeAndExpectIngested,
  expectGatewayError,
  expectRedactedRequestOnly,
  expectRedactedStreamingCompletion,
  gatewayControlPlaneRequest,
  gatewayModelSlug,
  ingestTrace,
  listGatewayModelIds,
  ORGANIZATION_ID,
  missingLocalEnv,
  POLL_INTERVAL_MS,
  REDACT_REQUEST_EMAIL,
  REDACT_STREAM_PROMPT,
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

const SPEND_LIMITED_COMPLETION = COMPLETIONS[1];

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

  // One provider is enough: the gateway counts spend the same way for every provider.
  it(
    "admits a request within the key's spend limit and rejects the next once it is spent",
    async () => {
      const { apiFormat, model, path, body } = SPEND_LIMITED_COMPLETION;
      await withGatewayApiKey(
        apiFormat,
        async ({ secretKey }) => {
          // Waits until the first request is ingested, by when its cost was counted.
          await completeAndExpectIngested({
            secretKey,
            apiFormat,
            path,
            body,
            providerModel: model,
          });

          // Spend counting runs asynchronously in Redis after the response, so
          // retry briefly in case fast ingestion outruns the counter write.
          await waitForExpect(
            async () => {
              const response = await fetch(`${suite.gatewayBaseUrl}${path}`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${secretKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
              });
              expect(response.headers.get("retry-after")).toBeNull();
              await expectGatewayError(response, 429, {
                error: {
                  message: expect.stringContaining("total budget"),
                  type: "insufficient_quota",
                  param: null,
                  code: "spend_limit_exceeded",
                },
              });
            },
            10_000,
            POLL_INTERVAL_MS,
          );
        },
        {
          spendLimit: {
            interval: GatewaySpendLimitInterval.TOTAL,
            limitUsd: 0.000001,
          },
        },
      );
    },
    COMPLETION_TIMEOUT_MS,
  );

  // One provider is enough: guardrails read the request, not the provider's reply.
  it(
    "blocks a last turn that matches a blocking guardrail and marks one that matches a logging guardrail",
    async () => {
      const { apiFormat, model, path, body } = SPEND_LIMITED_COMPLETION;
      const withLastTurn = (content: string) => ({
        ...body,
        messages: [
          { role: "user", content: "My SSN is 123-45-6789." },
          { role: "assistant", content: "Noted." },
          { role: "user", content },
        ],
      });
      await withGatewayApiKey(
        apiFormat,
        async ({ secretKey, guardrailIds: [, logGuardrailId] }) => {
          const blocked = await fetch(`${suite.gatewayBaseUrl}${path}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secretKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(withLastTurn("Card 4111 1111 1111 1111.")),
          });
          await expectGatewayError(blocked, 400, {
            error: {
              message: expect.stringContaining("Request blocked by guardrail"),
              type: "invalid_request_error",
              code: "guardrail_blocked",
            },
          });

          // The SSN sits in an earlier turn, so only the email is checked.
          const { traceId, observationId } = await completeAndExpectIngested({
            secretKey,
            apiFormat,
            path,
            body: withLastTurn(
              "Reply with the word hello to jane@example.com.",
            ),
            providerModel: model,
          });
          const observation = await getObservationByIdFromEventsTable({
            id: observationId,
            projectId: suite.projectId,
            traceId,
          });
          expect(observation?.level).toBe("WARNING");
          expect(JSON.stringify(observation?.metadata)).toContain(
            logGuardrailId,
          );
        },
        {
          guardrails: [
            { action: "BLOCK", presets: ["us_ssn", "credit_card"] },
            { action: "LOG", presets: ["email"] },
          ],
        },
      );
    },
    COMPLETION_TIMEOUT_MS,
  );

  it.each([
    {
      apiFormat: "openai.responses" as const,
      path: "/openai/v1/responses",
      body: {
        model: "gpt-6-sol",
        input: REDACT_STREAM_PROMPT,
        max_output_tokens: 256,
        stream: true,
      },
    },
    {
      apiFormat: "openai.chat-completions" as const,
      path: "/openai/v1/chat/completions",
      body: {
        model: "gpt-6-sol",
        messages: [{ role: "user", content: REDACT_STREAM_PROMPT }],
        max_completion_tokens: 256,
        stream: true,
      },
    },
  ])(
    "$apiFormat redacts streaming request and response with internal guardrails",
    async (request) => {
      await expectRedactedStreamingCompletion(request);
    },
    COMPLETION_TIMEOUT_MS,
  );

  it.each([
    {
      apiFormat: "openai.decisions" as const,
      path: "/openai/v1/decisions",
      providerModel: "gpt-6-luna",
      body: {
        model: "gpt-6-luna",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Contact ${REDACT_REQUEST_EMAIL}. The sky is green.`,
              },
            ],
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
      apiFormat: "openai.embeddings" as const,
      path: "/openai/v1/embeddings",
      providerModel: "text-embedding-3-small",
      body: {
        model: "text-embedding-3-small",
        input: `Contact ${REDACT_REQUEST_EMAIL}.`,
      },
    },
  ])(
    "$apiFormat redacts request with internal guardrails",
    async (request) => {
      await expectRedactedRequestOnly(request);
    },
    COMPLETION_TIMEOUT_MS,
  );

  it(
    "caps each key without a budget of its own by the default key budget, counted per key",
    async () => {
      const { apiFormat, model, path, body } = SPEND_LIMITED_COMPLETION;
      const { caller } = suite.admin;
      const { API_KEY: previousDefault } =
        await caller.aiGateway.getDefaultSpendLimits({
          orgId: ORGANIZATION_ID,
        });
      const setKeyDefault = (
        spendLimit: Parameters<
          typeof caller.aiGateway.setDefaultSpendLimit
        >[0]["spendLimit"],
      ) =>
        caller.aiGateway.setDefaultSpendLimit({
          orgId: ORGANIZATION_ID,
          scope: "API_KEY",
          spendLimit,
        });
      await setKeyDefault({
        interval: GatewaySpendLimitInterval.TOTAL,
        limitUsd: 0.000001,
      });
      try {
        await withGatewayApiKey(apiFormat, async (first) => {
          await withGatewayApiKey(apiFormat, async (second) => {
            await completeAndExpectIngested({
              secretKey: first.secretKey,
              apiFormat,
              path,
              body,
              providerModel: model,
            });
            await waitForExpect(
              async () => {
                const rejected = await fetch(`${suite.gatewayBaseUrl}${path}`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${first.secretKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(body),
                });
                await expectGatewayError(rejected, 429, {
                  error: expect.objectContaining({
                    code: "spend_limit_exceeded",
                  }),
                });
              },
              10_000,
              POLL_INTERVAL_MS,
            );

            // The first key spent the default, but the second has its own count.
            await completeAndExpectIngested({
              secretKey: second.secretKey,
              apiFormat,
              path,
              body,
              providerModel: model,
            });
          });
        });
      } finally {
        await setKeyDefault(previousDefault);
      }
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
