import { describe, it } from "vitest";

import { GatewayProvider } from "@langfuse/shared/src/db";
import {
  COMPLETION_TIMEOUT_MS,
  expectExternalGuardrailBlocks,
  missingLocalEnv,
  requiredEnv,
  setUpGatewayE2e,
} from "./gatewayE2eHarness";

const MODEL = "gpt-6-sol";

const skip = missingLocalEnv("LANGFUSE_LLM_CONNECTION_OPENAI_KEY");

describe.skipIf(skip)(
  "AI gateway OpenAI Moderation guardrail end-to-end",
  () => {
    setUpGatewayE2e(() => ({
      provider: GatewayProvider.OPENAI,
      credential: requiredEnv("LANGFUSE_LLM_CONNECTION_OPENAI_KEY"),
      models: [MODEL],
    }));

    it(
      "passes a benign request and blocks one OpenAI Moderation flags",
      async () => {
        await expectExternalGuardrailBlocks({
          providerModel: MODEL,
          guardrail: {
            type: "OPENAI_MODERATION",
            action: "BLOCK",
            config: { region: "us" },
            apiKey: requiredEnv("LANGFUSE_LLM_CONNECTION_OPENAI_KEY"),
          },
          flaggedPrompt:
            "I am going to find you tonight and kill you and your whole family.",
        });
      },
      COMPLETION_TIMEOUT_MS,
    );
  },
);
