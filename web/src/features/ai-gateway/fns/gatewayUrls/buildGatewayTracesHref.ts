import {
  AI_GATEWAY_GUARDRAIL_METADATA_PREFIX,
  AI_GATEWAY_KEY_ID_METADATA_KEY,
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  encodeFiltersGeneric,
  rangeToString,
  type FilterState,
  type TimeRange,
} from "@langfuse/shared";

type GatewayTracesSubject = "user" | "key" | "guardrail";

/** Link to the ingestion project's traces view filtered to one gateway user, API key, or guardrail. */
export function buildGatewayTracesHref({
  projectId,
  subject,
  subjectId,
  dateRange,
}: {
  projectId: string;
  subject: GatewayTracesSubject;
  subjectId: string;
  dateRange?: TimeRange;
}) {
  const filter: FilterState = [buildSubjectFilter(subject, subjectId)];
  const queryParts = [
    `filter=${encodeURIComponent(encodeFiltersGeneric(filter))}`,
  ];
  if (dateRange) {
    queryParts.push(
      `dateRange=${encodeURIComponent(rangeToString(dateRange))}`,
    );
  }

  return `/project/${encodeURIComponent(projectId)}/traces?${queryParts.join("&")}`;
}

function buildSubjectFilter(
  subject: GatewayTracesSubject,
  subjectId: string,
): FilterState[number] {
  switch (subject) {
    case "user":
      return {
        column: "metadata",
        type: "stringObject",
        key: AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
        operator: "=",
        value: subjectId,
      };
    case "key":
      return {
        column: "metadata",
        type: "stringObject",
        key: AI_GATEWAY_KEY_ID_METADATA_KEY,
        operator: "=",
        value: subjectId,
      };
    case "guardrail":
      return {
        column: "metadata",
        type: "stringObject",
        key: `${AI_GATEWAY_GUARDRAIL_METADATA_PREFIX}${subjectId}`,
        operator: "is set",
        value: "",
      };
  }
}
