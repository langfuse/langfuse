import { z } from "zod/v4";

export const versionSchema = z.string().regex(/^v?\d+\.\d+\.\d+(?:[-+].+)?$/); // e.g. v1.2.3, 1.2.3, v1.2.3-rc.1, v1.2.3+build.123

/**
 * Compare two semantic versions.
 * @param current - Current version (e.g., "v1.2.3")
 * @param latest - Latest/minimum version to compare against (e.g., "v1.2.3")
 * @returns "major" | "minor" | "patch" if latest is newer, null if current >= latest
 */
export const compareVersions = (
  current: string,
  latest: string,
): "major" | "minor" | "patch" | null => {
  const currentValidated = versionSchema.parse(current);
  const latestValidated = versionSchema.parse(latest);

  const parseVersion = (version: string) => {
    if (version.startsWith("v")) {
      version = version.slice(1);
    }
    // Split into version and pre-release parts
    const [versionPart, ...rest] = version.split(/[-+]/);
    const numbers = versionPart.split(".").map(Number);
    return {
      numbers,
      isPreRelease: rest.length > 0,
    };
  };

  const current_parsed = parseVersion(currentValidated);
  const latest_parsed = parseVersion(latestValidated);

  const [currentMajor, currentMinor, currentPatch] = current_parsed.numbers;
  const [latestMajor, latestMinor, latestPatch] = latest_parsed.numbers;

  // If current is a pre-release (RC) and latest is a full release of the same version,
  // consider it as needing a patch update
  if (
    current_parsed.isPreRelease &&
    !latest_parsed.isPreRelease &&
    currentMajor === latestMajor &&
    currentMinor === latestMinor &&
    currentPatch === latestPatch
  ) {
    return "patch";
  }

  if (latestMajor > currentMajor) return "major";
  if (latestMajor === currentMajor && latestMinor > currentMinor)
    return "minor";
  if (
    latestMajor === currentMajor &&
    latestMinor === currentMinor &&
    latestPatch > currentPatch
  )
    return "patch";

  return null;
};
