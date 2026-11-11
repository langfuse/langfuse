import type { ChangeEvent } from "react";

import { Input } from "@/src/components/design-system/Input/Input";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";

export type AzureEndpointFieldProps = {
  value: string;
  isEditing: boolean;
  onChange: (value: string) => void;
};

export function AzureEndpointField({
  value,
  isEditing,
  onChange,
}: AzureEndpointFieldProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="ph-no-capture">
      <FieldHeader
        htmlFor="gateway-azure-endpoint"
        label="Endpoint"
        description={
          <>
            The endpoint of your Microsoft Foundry or Azure OpenAI resource.{" "}
            {isEditing ? "Changing it requires a new API key. " : null}
            Requests name a deployment, so add your deployment names as models.
          </>
        }
      />
      <Input
        id="gateway-azure-endpoint"
        placeholder="https://my-resource.services.ai.azure.com"
        value={value}
        onChange={handleChange}
      />
    </div>
  );
}
