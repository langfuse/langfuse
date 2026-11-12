import { gatewayApiKeyExpirationOptions } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import type { CreateGatewayApiKeyFormValues } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/types/createGatewayApiKeyFormSchema";

/** Summarizes the collapsed "More options" section, e.g. "No expiration, No metadata". */
export const describeGatewayApiKeyOptions = ({
  expiryPreset,
  metadata,
}: Pick<CreateGatewayApiKeyFormValues, "expiryPreset" | "metadata">) => {
  const expiration =
    gatewayApiKeyExpirationOptions.find(
      (option) => option.value === expiryPreset,
    )?.summary ?? "";
  const metadataCount = metadata.filter((field) => field.key.trim()).length;
  const metadataSummary =
    metadataCount === 0
      ? "No metadata"
      : `${metadataCount} metadata ${metadataCount === 1 ? "field" : "fields"}`;
  return `${expiration}, ${metadataSummary}`;
};
