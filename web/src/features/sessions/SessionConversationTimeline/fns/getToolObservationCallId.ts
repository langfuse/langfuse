export type ToolObservation = {
  type?: string | null;
  name?: string | null;
  input?: unknown;
  metadata: unknown;
  metadataTruncated?: boolean;
};

export function getToolObservationCallId(observation: ToolObservation) {
  if (observation.metadataTruncated) return null;

  let metadataValue: unknown = observation.metadata;
  if (typeof metadataValue === "string") {
    try {
      metadataValue = JSON.parse(metadataValue) as unknown;
    } catch {
      return null;
    }
  }
  if (
    typeof metadataValue !== "object" ||
    metadataValue === null ||
    Array.isArray(metadataValue)
  ) {
    return null;
  }

  const metadata = metadataValue as Record<string, unknown>;
  const toolCallId = metadata.toolCallId ?? metadata.callID;
  return typeof toolCallId === "string" && toolCallId.length > 0
    ? toolCallId
    : null;
}
