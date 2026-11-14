import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";

export const GATEWAY_SETUP = {
  description:
    "Add provider connections and choose how gateway traffic is recorded in Langfuse.",
  docsUrl: GATEWAY_SETUP_DOCS_URL,
} as const;
