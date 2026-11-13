import { describe, it } from "vitest";

import { GatewayProvider } from "@langfuse/shared/src/db";
import {
  chatCompletionRequest,
  COMPLETION_TIMEOUT_MS,
  expectListedAndIngested,
  missingLocalEnv,
  requiredEnv,
  setUpGatewayE2e,
} from "./gatewayE2eHarness";

const MODEL = "gemini-2.5-flash-lite";

const skip = missingLocalEnv("LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY");

describe.skipIf(skip)("AI gateway Google AI Studio end-to-end", () => {
  setUpGatewayE2e(() => ({
    provider: GatewayProvider.GOOGLE_AI_STUDIO,
    credential: requiredEnv("LANGFUSE_LLM_CONNECTION_GOOGLEAISTUDIO_KEY"),
    models: [MODEL],
  }));

  it(
    `lists and completes ${MODEL}, ingested with cost`,
    async () => {
      await expectListedAndIngested(chatCompletionRequest(MODEL));
    },
    COMPLETION_TIMEOUT_MS,
  );
});
