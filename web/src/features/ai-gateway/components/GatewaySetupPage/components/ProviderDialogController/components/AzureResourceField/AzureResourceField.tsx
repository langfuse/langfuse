import { Input } from "@/src/components/design-system/Input/Input";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";
import {
  isAzureProjectName,
  isAzureResourceName,
} from "@/src/features/ai-gateway/fns/azureResource";

export type AzureResourceFieldValue = { name: string; project: string };

export type AzureResourceFieldProps = {
  value: AzureResourceFieldValue;
  isEditing: boolean;
  onChange: (value: AzureResourceFieldValue) => void;
};

export function AzureResourceField({
  value,
  isEditing,
  onChange,
}: AzureResourceFieldProps) {
  const isNameInvalid =
    value.name.trim() !== "" && !isAzureResourceName(value.name);
  const isProjectInvalid =
    value.project.trim() !== "" && !isAzureProjectName(value.project);

  return (
    <div className="ph-no-capture space-y-4">
      <div>
        <FieldHeader
          htmlFor="gateway-azure-resource"
          label="Resource name"
          description={
            <>
              The name of your Microsoft Foundry resource, as in{" "}
              <code>my-resource.services.ai.azure.com</code>.{" "}
              {isEditing ? "Changing it requires a new API key." : null}
            </>
          }
        />
        <div className="space-y-1">
          <Input
            id="gateway-azure-resource"
            placeholder="my-resource"
            value={value.name}
            aria-invalid={isNameInvalid}
            aria-describedby={
              isNameInvalid ? "gateway-azure-resource-error" : undefined
            }
            error={isNameInvalid}
            onChange={(event) =>
              onChange({ ...value, name: event.target.value })
            }
          />
          {isNameInvalid ? (
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
      <div>
        <FieldHeader
          htmlFor="gateway-azure-project"
          label="Project name (optional)"
          description="Needed to list the project's deployments as models. Without it, only custom models are available unless the resource has a default project."
        />
        <div className="space-y-1">
          <Input
            id="gateway-azure-project"
            placeholder="my-project"
            value={value.project}
            aria-invalid={isProjectInvalid}
            aria-describedby={
              isProjectInvalid ? "gateway-azure-project-error" : undefined
            }
            error={isProjectInvalid}
            onChange={(event) =>
              onChange({ ...value, project: event.target.value })
            }
          />
          {isProjectInvalid ? (
            <p
              id="gateway-azure-project-error"
              role="alert"
              className="text-destructive text-sm"
            >
              Use the project name only: letters, digits, periods, hyphens and
              underscores.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
