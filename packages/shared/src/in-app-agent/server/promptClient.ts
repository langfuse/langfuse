import { Langfuse } from "langfuse";

import { env } from "../../env";
import { getProductBaseUrl } from "../../server/utils/baseUrl";

let client: Langfuse | null = null;

/**
 * Client for fetching the agent system prompt from the Langfuse AI-features
 * project. Prompt fetching only — tracing is disabled because the agent has
 * its own instrumentation sink. Without LANGFUSE_AI_FEATURES_HOST the client
 * targets this deployment itself (e.g. PR previews), never cloud.langfuse.com.
 */
export function getInAppAgentPromptClient(): Langfuse {
  if (!client) {
    client = new Langfuse({
      publicKey: env.LANGFUSE_AI_FEATURES_PUBLIC_KEY ?? "",
      secretKey: env.LANGFUSE_AI_FEATURES_SECRET_KEY ?? "",
      baseUrl: env.LANGFUSE_AI_FEATURES_HOST ?? getProductBaseUrl().toString(),
      enabled: false,
    });
  }

  return client;
}
