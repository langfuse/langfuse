import { VERSION } from "@/src/constants";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

export const V4_UPGRADE_GUIDE_URL =
  "https://langfuse.com/self-hosting/upgrade/upgrade-guides/upgrade-v3-to-v4";

export const V4_UPGRADE_HINT_TITLE = "Langfuse v4 is available";
export const V4_UPGRADE_HINT_DESCRIPTION =
  "Langfuse v3 no longer receives feature updates. Upgrade to v4 to get the latest features and improvements.";

const isLangfuseV3 = /^v?3\./.test(VERSION);

/**
 * Whether to nudge the user to upgrade this deployment to Langfuse v4.
 * Only self-hosted Langfuse v3 deployments qualify: Langfuse Cloud is upgraded
 * by Langfuse, and v4 deployments have nothing to upgrade to.
 */
export function useShowV4UpgradeHint(): boolean {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  return !isLangfuseCloud && isLangfuseV3;
}
