import { convertDateToClickhouseDateTime } from "../../../server/clickhouse/client";
import {
  normalizeIngestionSdkName,
  type IngestionSdkCanonicalName,
} from "../../../server/ingestion/ingestionAttribution";
import { queryClickhouse } from "../../../server/repositories/clickhouse";
import { parseVersionString } from "../../../server/utils/compareVersions";
import type { AdminIssueDefinition, RuleIssue } from "../adminIssueDefinitions";

// Update these together when new stable SDK releases are available.
const latestVersions = {
  python: { version: "4.16.0", label: "Python" },
  javascript: { version: "5.11.1", label: "JavaScript" },
} as const satisfies Record<
  IngestionSdkCanonicalName,
  { version: string; label: string }
>;

export const isOutdatedSdkVersion = (used: string, latest: string): boolean => {
  const current = parseVersionString(used);
  const target = parseVersionString(latest);
  if (!current || !target) return false;
  return (
    current.major < target.major ||
    (current.major === target.major && target.minor - current.minor >= 20)
  );
};

export const outdatedSdkVersionsRule = {
  id: "outdated-sdk-versions",
  name: "Update outdated SDKs",
  group: "sdks",
  callback: async (projectId): Promise<RuleIssue[]> => {
    const since = convertDateToClickhouseDateTime(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );
    // The row-level event builder cannot express DISTINCT/GROUP BY.
    const versions = await queryClickhouse<{
      sdk_name: string;
      sdk_version: string;
    }>({
      query: `SELECT
        e.ingestion_sdk_name AS sdk_name,
        e.ingestion_sdk_version AS sdk_version
      FROM events_core e
      WHERE e.project_id = {projectId: String}
        AND e.start_time >= {since: DateTime64(3)}
        AND toDate(e.start_time) >= toDate({since: DateTime64(3)})
        AND e.is_deleted = 0
        AND e.ingestion_sdk_name != 'unknown'
        AND e.ingestion_sdk_version != 'unknown'
      GROUP BY e.ingestion_sdk_name, e.ingestion_sdk_version`,
      params: { projectId, since },
      tags: { projectId },
      preferredClickhouseService: "EventsReadOnly",
    });

    const outdated = new Map<IngestionSdkCanonicalName, Set<string>>();
    for (const { sdk_name, sdk_version } of versions) {
      const sdk = normalizeIngestionSdkName(sdk_name);
      if (
        !sdk ||
        !isOutdatedSdkVersion(sdk_version, latestVersions[sdk].version)
      )
        continue;
      const used = outdated.get(sdk) ?? new Set<string>();
      used.add(sdk_version);
      outdated.set(sdk, used);
    }

    return [...outdated].map(([sdk, used]) => ({
      description: `Your ${latestVersions[sdk].label} SDK versions ${[...used]
        .sort()
        .map((version) => `\`${version}\``)
        .join(
          ", ",
        )} were used in the last 7 days. The latest version is \`${latestVersions[sdk].version}\`. Upgrade to the latest SDK to receive fixes and improvements. [SDK upgrade guide](https://langfuse.com/docs/observability/sdk/overview).`,
      priority: 3,
    }));
  },
} as const satisfies AdminIssueDefinition;
