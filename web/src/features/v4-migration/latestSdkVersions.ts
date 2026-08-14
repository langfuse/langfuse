// Latest released Langfuse SDK versions, for the Health page's freshness
// ("Behind") badges.
//
// TODO(health-pages): OPEN QUESTION — these are hardcoded as of 2026-08-14 and
// rot as SDKs release. Before this ships, replace with a server-side registry
// lookup (npm for @langfuse/tracing, PyPI for langfuse) cached ~24h in Redis
// with these values as fallback. Tracked in the PR description.
const LATEST_SDK_VERSION_BY_CANONICAL_NAME: Record<
  "python" | "javascript",
  string
> = {
  python: "4.14.4",
  javascript: "5.10.0",
};

export type SdkFreshness = "current" | "behind" | "unknown";

const parseVersion = (version: string): number[] | null => {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) return null;
  return parts;
};

const compareVersions = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

/**
 * Freshness relative to the latest released version of the SAME current-major
 * SDK line. Legacy-major series report "unknown": their staleness is already
 * the compatibility badge's job, and comparing a v3 JS SDK against
 * @langfuse/tracing 5.x would be misleading.
 */
export const getSdkFreshness = (series: {
  canonicalSdkName: "python" | "javascript" | null;
  sdkVersion: string;
  sdkVersionMajor: number | null;
  latestSdkMajor: number | null;
}): SdkFreshness => {
  if (
    !series.canonicalSdkName ||
    series.sdkVersionMajor === null ||
    series.latestSdkMajor === null ||
    series.sdkVersionMajor < series.latestSdkMajor
  ) {
    return "unknown";
  }
  const latest = parseVersion(
    LATEST_SDK_VERSION_BY_CANONICAL_NAME[series.canonicalSdkName],
  );
  const current = parseVersion(series.sdkVersion);
  if (!latest || !current) return "unknown";
  return compareVersions(current, latest) >= 0 ? "current" : "behind";
};
