import { getFips } from "crypto";
import { env, type SharedEnv } from "../../../env";
import { isEnterpriseLicenseAvailable } from "../licenseCheck";

/**
 * Enforce FIPS mode (LANGFUSE_REQUIRE_FIPS=true), an enterprise feature.
 *
 * Fails closed: when FIPS mode is requested, startup must stop unless an
 * enterprise license is available and Node's OpenSSL FIPS provider is active.
 * The provider is only active when the host kernel runs in FIPS mode, so a
 * container cannot switch it on by itself.
 *
 * Imports nothing that opens connections, so callers can run it before any
 * other startup code.
 */
export function assertFipsMode(envOverride?: SharedEnv): void {
  const e = envOverride ?? env;

  if (e.LANGFUSE_REQUIRE_FIPS !== "true") {
    return;
  }

  if (!isEnterpriseLicenseAvailable(e)) {
    throw new Error(
      "LANGFUSE_REQUIRE_FIPS=true requires a Langfuse enterprise license (LANGFUSE_EE_LICENSE_KEY).",
    );
  }

  if (getFips() !== 1) {
    throw new Error(
      "LANGFUSE_REQUIRE_FIPS=true but Node's OpenSSL FIPS provider is not active (crypto.getFips() != 1). Run Langfuse on a host with FIPS mode enabled.",
    );
  }
}
