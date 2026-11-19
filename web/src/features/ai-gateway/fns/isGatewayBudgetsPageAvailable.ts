import { env } from "@/src/env.mjs";

/** The Budgets page is only released on PR previews (`DEV`) and staging. */
export function isGatewayBudgetsPageAvailable() {
  const region = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  return region === "DEV" || region === "STAGING";
}
