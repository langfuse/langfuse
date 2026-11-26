import type { EditableGatewayApiKeyFields } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/types/editableGatewayApiKeyFieldsSchema";

/** Turns the metadata rows into the stored object, dropping rows without a key. */
export function toGatewayApiKeyMetadata(
  rows: EditableGatewayApiKeyFields["metadata"],
) {
  return Object.fromEntries(
    rows
      .filter((row) => row.key.trim())
      .map((row) => [row.key.trim(), row.value]),
  );
}
