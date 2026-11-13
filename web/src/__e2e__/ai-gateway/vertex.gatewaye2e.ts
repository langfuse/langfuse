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

const MODEL = "google/gemini-2.5-flash-lite";

const skip = missingLocalEnv("LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY");

describe.skipIf(skip)("AI gateway Vertex AI end-to-end", () => {
  setUpGatewayE2e(() => ({
    provider: GatewayProvider.VERTEX,
    credential: requiredEnv("LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY"),
    config: { location: "global" },
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
