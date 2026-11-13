import type { EditableGatewayApiKeyFields } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/types/editableGatewayApiKeyFieldsSchema";

/** Turns stored key metadata into editable rows; values are edited as text. */
export function toGatewayApiKeyMetadataRows(
  metadata: unknown,
): EditableGatewayApiKeyFields["metadata"] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  return Object.entries(metadata).flatMap(([key, value]) =>
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
      ? [{ key, value: String(value) }]
      : [],
  );
}
