import { describe, it } from "vitest";

import { GatewayProvider } from "@langfuse/shared/src/db";
import {
  COMPLETION_TIMEOUT_MS,
  expectListedAndIngested,
  gatewayModelSlug,
  missingLocalEnv,
  requiredEnv,
  setUpGatewayE2e,
} from "./gatewayE2eHarness";

const API_FORMAT = "anthropic.messages";
// The EU inference profile the CI account may call; Bedrock serves Anthropic
// models on Messages only.
const MODEL = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

const skip = missingLocalEnv(
  "LANGFUSE_LLM_CONNECTION_BEDROCK_API_KEY",
  "LANGFUSE_LLM_CONNECTION_BEDROCK_REGION",
);

describe.skipIf(skip)("AI gateway Bedrock end-to-end", () => {
  setUpGatewayE2e(() => ({
    provider: GatewayProvider.BEDROCK,
    credential: requiredEnv("LANGFUSE_LLM_CONNECTION_BEDROCK_API_KEY"),
    config: { region: requiredEnv("LANGFUSE_LLM_CONNECTION_BEDROCK_REGION") },
    models: [MODEL],
  }));

  it(
    `lists and completes ${MODEL}, ingested with cost`,
    async () => {
      await expectListedAndIngested({
        apiFormat: API_FORMAT,
        path: "/anthropic/v1/messages",
        body: {
          model: gatewayModelSlug(MODEL),
          max_tokens: 32,
          messages: [{ role: "user", content: "Reply with the word hello." }],
        },
        headers: { "anthropic-version": "2023-06-01" },
        providerModel: MODEL,
        // Bedrock reports the model without the profile's region prefix.
        responseModel: "anthropic.claude-haiku-4-5-20251001-v1:0",
      });
    },
    COMPLETION_TIMEOUT_MS,
  );
});
