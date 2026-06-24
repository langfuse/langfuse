import { z } from "zod";

export const versionSchema = z.string().regex(/^v?\d+\.\d+\.\d+(?:[-+].+)?$/); // e.g. v1.2.3, 1.2.3, v1.2.3-rc.1, v1.2.3+build.123

type VersionTuple = readonly [number, number, number];

export type ParsedVersion = {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  tuple: VersionTuple;
  isPreRelease: boolean;
};

export const parseVersionString = (
  rawVersion: string,
): ParsedVersion | null => {
  const match = rawVersion.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[.+-].+)?$/);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (![major, minor, patch].every(Number.isSafeInteger)) return null;

  return {
    raw: rawVersion,
    major,
    minor,
    patch,
    tuple: [major, minor, patch],
    isPreRelease: /[-+]/.test(rawVersion),
  };
};

export const compareParsedVersions = (
  left: ParsedVersion,
  right: ParsedVersion,
): number => {
  for (let i = 0; i < left.tuple.length; i++) {
    if (left.tuple[i] > right.tuple[i]) return 1;
    if (left.tuple[i] < right.tuple[i]) return -1;
  }

  return 0;
};

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

  const currentParsed = parseVersionString(currentValidated);
  const latestParsed = parseVersionString(latestValidated);

  if (!currentParsed || !latestParsed) {
    throw new Error("Invalid semantic version");
  }

  // If current is a pre-release (RC) and latest is a full release of the same version,
  // consider it as needing a patch update
  if (
    currentParsed.isPreRelease &&
    !latestParsed.isPreRelease &&
    compareParsedVersions(currentParsed, latestParsed) === 0
  ) {
    return "patch";
  }

  if (latestParsed.major > currentParsed.major) return "major";
  if (
    latestParsed.major === currentParsed.major &&
    latestParsed.minor > currentParsed.minor
  )
    return "minor";
  if (
    latestParsed.major === currentParsed.major &&
    latestParsed.minor === currentParsed.minor &&
    latestParsed.patch > currentParsed.patch
  )
    return "patch";

  return null;
};
