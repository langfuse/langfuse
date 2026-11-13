import { describe, it } from "vitest";

import { GatewayProvider } from "@langfuse/shared/src/db";
import {
  COMPLETION_TIMEOUT_MS,
  expectGatewayError,
  expectListedAndIngested,
  missingLocalEnv,
  requiredEnv,
  setUpGatewayE2e,
  withGatewayApiKey,
} from "./gatewayE2eHarness";

const API_FORMAT = "anthropic.messages";
const MODEL = "claude-opus-5-5";
const ANTHROPIC_HEADERS = { "anthropic-version": "2023-06-01" };

const skip = missingLocalEnv("LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY");

describe.skipIf(skip)("AI gateway Anthropic end-to-end", () => {
  const suite = setUpGatewayE2e(() => ({
    provider: GatewayProvider.ANTHROPIC,
    credential: requiredEnv("LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY"),
    models: [MODEL],
  }));

  it(
    `lists and completes ${MODEL}, ingested with cost`,
    async () => {
      await expectListedAndIngested({
        apiFormat: API_FORMAT,
        path: "/anthropic/v1/messages",
        // Unprefixed, which resolves while this is the only enabled connection.
        body: {
          model: MODEL,
          max_tokens: 32,
          messages: [{ role: "user", content: "Reply with the word hello." }],
        },
        headers: ANTHROPIC_HEADERS,
        providerModel: MODEL,
      });
    },
    COMPLETION_TIMEOUT_MS,
  );

  it("rejects an unknown model", async () => {
    await withGatewayApiKey(API_FORMAT, async ({ secretKey }) => {
      const response = await fetch(
        `${suite.gatewayBaseUrl}/anthropic/v1/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "not-a-gateway-model",
            max_tokens: 8,
            messages: [{ role: "user", content: "hello" }],
          }),
        },
      );
      await expectGatewayError(response, 400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Invalid gateway model",
        },
      });
    });
  });
});
