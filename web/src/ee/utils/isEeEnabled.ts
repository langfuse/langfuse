import { env } from "@/src/env.mjs";

/**
 * Function to determine if the enterprise edition (EE) features are enabled. Do not use in frontend code as env variables are not available in the browser.
 *
 * This hook checks two conditions:
 * 1. If Langfuse is running on Langfuse Cloud
 * 2. If EE license is provided based on the user's session
 *
 * @returns {boolean}
 */

export const isEeEnabled =
  Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) ||
  Boolean(env.LANGFUSE_EE_LICENSE_KEY);
