import { upsertDefaultModelPrices } from "./scripts/upsertDefaultModelPrices";
import { upsertLangfuseDashboards } from "./scripts/upsertLangfuseDashboards";
import {
  initializeClickhouseCompatibility,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "./env";
import { IN_APP_AGENT_SANDBOX_RUNTIME_PROTOCOL_VERSION } from "./features/in-app-agent/runtime/sandbox/protocolVersion";

export const initializeWorker = async (): Promise<void> => {
  await initializeClickhouseCompatibility();

  await Promise.all([upsertDefaultModelPrices(), upsertLangfuseDashboards()]);

  if (env.LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER) {
    logger.info("Assistant sandbox enabled", {
      provider: env.LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER,
      expectedRuntimeProtocolVersion:
        IN_APP_AGENT_SANDBOX_RUNTIME_PROTOCOL_VERSION,
    });
  }
};
