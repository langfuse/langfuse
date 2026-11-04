import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";

export const GATEWAY_SETUP = {
  title: "Gateway setup",
  description:
    "Connect provider credentials and choose how gateway traffic is recorded in Langfuse.",
  docsUrl: GATEWAY_SETUP_DOCS_URL,
} as const;
