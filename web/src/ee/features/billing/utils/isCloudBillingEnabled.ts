import { env } from "@/src/env.mjs";

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
