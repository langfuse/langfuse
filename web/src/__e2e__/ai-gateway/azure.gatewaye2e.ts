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

const skip = missingLocalEnv(
  "LANGFUSE_LLM_CONNECTION_AZURE_KEY",
  "LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL",
  "LANGFUSE_LLM_CONNECTION_AZURE_MODEL",
);

describe.skipIf(skip)("AI gateway Azure end-to-end", () => {
  // Azure requests name a deployment, not a model.
  let deployment = "";
  setUpGatewayE2e(() => {
    deployment = requiredEnv("LANGFUSE_LLM_CONNECTION_AZURE_MODEL");
    return {
      provider: GatewayProvider.AZURE,
      credential: requiredEnv("LANGFUSE_LLM_CONNECTION_AZURE_KEY"),
      baseURL: requiredEnv("LANGFUSE_LLM_CONNECTION_AZURE_BASE_URL"),
      models: [deployment],
    };
  });

  it(
    "lists and completes the deployment, ingested with cost",
    async () => {
      // Azure reports the deployed model, whatever the deployment is named.
      await expectListedAndIngested({
        ...chatCompletionRequest(deployment),
        responseModel: null,
      });
    },
    COMPLETION_TIMEOUT_MS,
  );
});
