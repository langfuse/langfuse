import { env } from "@/src/env.mjs";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

/**
 * Server-side check to determine if cloud billing is enabled.
 * Cloud billing requires NEXT_PUBLIC_LANGFUSE_CLOUD_REGION to be set.
 *
 * Use this in server-side code (tRPC routers, API routes).
 * For client-side components, use the hook useIsCloudBillingAvailable.
 *
 * @returns true if cloud billing should be active
 */
export function isCloudBillingEnabled(): boolean {
  return Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
}

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
