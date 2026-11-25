import {
  AI_GATEWAY_KEY_ID_METADATA_KEY,
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  encodeFiltersGeneric,
  type FilterState,
} from "@langfuse/shared";

const metadataKeysBySubject = {
  user: AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  key: AI_GATEWAY_KEY_ID_METADATA_KEY,
} as const;

type GatewayTracesSubject = keyof typeof metadataKeysBySubject;

/** Link to the ingestion project's traces view filtered to one gateway user or API key. */
export function buildGatewayTracesHref({
  projectId,
  subject,
  subjectId,
}: {
  projectId: string;
  subject: GatewayTracesSubject;
  subjectId: string;
}) {
  const filter: FilterState = [
    {
      column: "metadata",
      type: "stringObject",
      key: metadataKeysBySubject[subject],
      operator: "=",
      value: subjectId,
    },
  ];

  return `/project/${encodeURIComponent(projectId)}/traces?filter=${encodeURIComponent(encodeFiltersGeneric(filter))}`;
}
