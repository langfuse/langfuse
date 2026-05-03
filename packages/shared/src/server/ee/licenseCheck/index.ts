import { env, type SharedEnv } from "../../../env";

/**
 * Check if enterprise EE license is available.
 * Returns true for:
 * - Langfuse Cloud (any region)
 * - Self-hosted with enterprise license key (starts with "langfuse_ee_")
 *
 * Note: Pro tier (langfuse_pro_*) does NOT count as enterprise.
 */
export function isEnterpriseLicenseAvailable(envOverride?: SharedEnv): boolean {
  const e = envOverride ?? env;

  // Langfuse Cloud always has enterprise features
  if (e.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined) {
    return true;
  }

  // Self-hosted: must have enterprise license key (not pro)
  const licenseKey = e.LANGFUSE_EE_LICENSE_KEY;
  if (licenseKey && licenseKey.startsWith("langfuse_ee_")) {
    return true;
  }

  return false;
}
