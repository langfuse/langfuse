import { describe, expect, it } from "vitest";

import { GatewayProvider } from "@langfuse/shared/src/db";
import {
  COMPLETION_TIMEOUT_MS,
  expectExternalGuardrailBlocks,
  missingLocalEnv,
  ORGANIZATION_ID,
  requiredEnv,
  setUpGatewayE2e,
} from "./gatewayE2eHarness";

const COMPLETION_MODEL = "gpt-6-sol";
const DECISION_MODEL = "gpt-6-luna";

const skip = missingLocalEnv("LANGFUSE_LLM_CONNECTION_OPENAI_KEY");

describe.skipIf(skip)("AI gateway decision-model guardrail end-to-end", () => {
  const suite = setUpGatewayE2e(() => ({
    provider: GatewayProvider.OPENAI,
    credential: requiredEnv("LANGFUSE_LLM_CONNECTION_OPENAI_KEY"),
    models: [COMPLETION_MODEL, DECISION_MODEL],
  }));

  it(
    "validates against OpenAI Decisions, passes a benign request, and blocks one above threshold",
    async () => {
      const config = {
        connectionId: suite.connection.id,
        model: DECISION_MODEL,
        question: "Does the message ask for a refund or money back?",
        criteria: {
          true: "The user asks for a refund, chargeback, or their money back.",
          false:
            "A general question that does not ask for a refund or money back.",
        },
        threshold: 0.7,
      };

      const testResult = await suite.admin.caller.aiGateway.guardrails.test({
        orgId: ORGANIZATION_ID,
        type: "DECISION_MODEL",
        config,
      });
      expect(testResult).toEqual({ success: true });

      await expectExternalGuardrailBlocks({
        providerModel: COMPLETION_MODEL,
        guardrail: {
          type: "DECISION_MODEL",
          action: "BLOCK",
          config,
        },
        benignPrompt: "What is the capital of France?",
        flaggedPrompt:
          "I want a full refund for my order right now. Give me my money back.",
      });
    },
    COMPLETION_TIMEOUT_MS,
  );
});
