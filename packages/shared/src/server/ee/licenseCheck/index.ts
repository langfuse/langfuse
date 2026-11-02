import { env, type SharedEnv } from "../../../env";

/**
 * Check if a government license is available. Returns true only for
 * self-hosted deployments with a government license key (starts with
 * "lf_gov_"); Langfuse Cloud does not count.
 */
export function isGovernmentLicenseAvailable(envOverride?: SharedEnv): boolean {
  const e = envOverride ?? env;

  return e.LANGFUSE_EE_LICENSE_KEY?.startsWith("lf_gov_") ?? false;
}

/**
 * Check if enterprise EE license is available.
 * Returns true for:
 * - Langfuse Cloud (any region)
 * - Self-hosted with enterprise license key (starts with "langfuse_ee_")
 * - Self-hosted with government license key (starts with "lf_gov_"), which
 *   includes every enterprise feature
 *
 * Note: Pro tier (langfuse_pro_*) does NOT count as enterprise.
 */
export function isEnterpriseLicenseAvailable(envOverride?: SharedEnv): boolean {
  const e = envOverride ?? env;

  // Langfuse Cloud always has enterprise features
  if (e.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined) {
    return true;
  }

  // Self-hosted: must have enterprise or government license key (not pro)
  const licenseKey = e.LANGFUSE_EE_LICENSE_KEY;
  if (licenseKey && licenseKey.startsWith("langfuse_ee_")) {
    return true;
  }

  return isGovernmentLicenseAvailable(e);
}
