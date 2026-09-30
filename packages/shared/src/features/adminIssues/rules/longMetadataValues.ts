import { buildTracePath } from "../../../utils/productUrl";
import type { AdminIssueDefinition, RuleIssue } from "../adminIssueDefinitions";

/** Metadata values longer than this many characters are reported. */
export const LONG_METADATA_VALUE_THRESHOLD = 200;
const MAX_LISTED_KEYS = 10;
const MAX_KEY_DISPLAY_LENGTH = 100;

export type LongMetadataValueKey = {
  key: string;
  /** Longest value seen for the key, in characters. */
  maxValueLength: number;
};

/** Reported by the ingestion worker when it writes an observation. */
export const longMetadataValuesRule = {
  id: "long-metadata-values",
  name: "Long metadata values",
  group: "sdks",
  ctaLabel: "View observation",
} as const satisfies AdminIssueDefinition;

export const buildLongMetadataValuesIssue = (params: {
  projectId: string;
  keys: LongMetadataValueKey[];
  exampleTraceId: string;
  exampleObservationId: string;
}): RuleIssue => {
  const keys = [...params.keys].sort(
    (a, b) => b.maxValueLength - a.maxValueLength,
  );
  const listed = keys
    .slice(0, MAX_LISTED_KEYS)
    .map(
      ({ key, maxValueLength }) =>
        `\`${key.length > MAX_KEY_DISPLAY_LENGTH ? `${key.slice(0, MAX_KEY_DISPLAY_LENGTH)}…` : key}\` (${maxValueLength})`,
    )
    .join(", ");
  const more =
    keys.length > MAX_LISTED_KEYS
      ? ` and ${keys.length - MAX_LISTED_KEYS} more`
      : "";

  return {
    description: `Metadata values longer than ${LONG_METADATA_VALUE_THRESHOLD} characters were sent for ${keys.length === 1 ? "key" : "keys"} ${listed}${more} (longest value in characters). Filters on long metadata values are slower. Keep metadata you filter on short, and send long content as observation input or output instead. [Learn more](https://langfuse.com/docs/observability/features/metadata).`,
    priority: 3,
    ctaLink: buildTracePath({
      projectId: params.projectId,
      traceId: params.exampleTraceId,
      observationId: params.exampleObservationId,
    }),
  };
};
