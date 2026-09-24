import { useLangfuseCloudRegion } from "@/src/features/organizations";

/**
 * Client-side hook to check if cloud billing features are available.
 * Uses the NEXT_PUBLIC_LANGFUSE_CLOUD_REGION to determine availability.
 *
 * Components should use this to conditionally render billing features.
 *
 * @returns true if cloud billing features should be shown/enabled
 */
export function useIsCloudBillingAvailable(): boolean {
  const { region } = useLangfuseCloudRegion();
  return Boolean(region);
}
