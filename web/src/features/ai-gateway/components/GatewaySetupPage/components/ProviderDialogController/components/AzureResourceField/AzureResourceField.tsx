import type { ChangeEvent } from "react";

import { Input } from "@/src/components/design-system/Input/Input";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";
import { isAzureResourceName } from "@/src/features/ai-gateway/fns/azureResource";

export type AzureResourceFieldProps = {
  value: string;
  isEditing: boolean;
  onChange: (value: string) => void;
};

export function AzureResourceField({
  value,
  isEditing,
  onChange,
}: AzureResourceFieldProps) {
  const isInvalid = value.trim() !== "" && !isAzureResourceName(value);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="ph-no-capture">
      <FieldHeader
        htmlFor="gateway-azure-resource"
        label="Resource name"
        description={
          <>
            The name of your Microsoft Foundry resource, as in{" "}
            <code>my-resource.services.ai.azure.com</code>.{" "}
            {isEditing ? "Changing it requires a new API key. " : null}
            Deployments of its default project are listed as models.
          </>
        }
      />
      <div className="space-y-1">
        <Input
          id="gateway-azure-resource"
          placeholder="my-resource"
          value={value}
          aria-invalid={isInvalid}
          aria-describedby={
            isInvalid ? "gateway-azure-resource-error" : undefined
          }
          error={isInvalid}
          onChange={handleChange}
        />
        {isInvalid ? (
          <p
            id="gateway-azure-resource-error"
            role="alert"
            className="text-destructive text-sm"
          >
            Use the resource name only: lowercase letters, digits and hyphens.
          </p>
        ) : null}
      </div>
    </div>
  );
}
