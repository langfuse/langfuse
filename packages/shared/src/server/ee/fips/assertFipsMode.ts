import { getFips } from "crypto";
import { env, type SharedEnv } from "../../../env";
import { isEnterpriseLicenseAvailable } from "../licenseCheck";

/**
 * Enforce FIPS mode (LANGFUSE_REQUIRE_FIPS=true), an enterprise feature.
 *
 * Fails closed: when FIPS mode is requested, startup must stop unless an
 * enterprise license is available and Node's OpenSSL FIPS provider is active.
 * FIPS mode is supported on the -fips image variant (RHEL's validated OpenSSL
 * provider on UBI 9), where the provider is only active when the host kernel
 * runs in FIPS mode, so a container cannot switch it on by itself.
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
      "LANGFUSE_REQUIRE_FIPS=true but Node's OpenSSL FIPS provider is not active (crypto.getFips() != 1). Run the -fips Langfuse image variant on a host with FIPS mode enabled.",
    );
  }

  const incompatibleOptions = getFipsIncompatibleOptions(e);
  if (incompatibleOptions.length > 0) {
    throw new Error(
      `LANGFUSE_REQUIRE_FIPS=true cannot be combined with ${incompatibleOptions.join("; ")}.`,
    );
  }
}

/**
 * getFipsIncompatibleOptions lists configured options whose code paths compute
 * MD5, which the FIPS provider rejects at runtime, so startup fails instead of
 * the affected uploads or deletes.
 */
function getFipsIncompatibleOptions(e: SharedEnv): string[] {
  const options: string[] = [];
  if (e.LANGFUSE_S3_DELETE_OBJECTS_CHECKSUM_ALGORITHM === "MD5") {
    options.push(
      "LANGFUSE_S3_DELETE_OBJECTS_CHECKSUM_ALGORITHM=MD5 (use SHA256, or leave it unset for CRC32)",
    );
  }
  if (e.LANGFUSE_USE_OCI_NATIVE_OBJECT_STORAGE === "true") {
    options.push(
      "LANGFUSE_USE_OCI_NATIVE_OBJECT_STORAGE=true (the OCI SDK hashes every upload part with MD5; use OCI's S3-compatible endpoint instead)",
    );
  }
  return options;
}
