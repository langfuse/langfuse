import { useController, type Control } from "react-hook-form";

import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { AllowedModelsPreview } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/components/AllowedModelsPreview/AllowedModelsPreview";
import { ModelPatternsInput } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/components/ModelPatternsInput/ModelPatternsInput";
import type { EditableGatewayApiKeyFields } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/types/editableGatewayApiKeyFieldsSchema";
import { matchesGatewayModelPatterns } from "@/src/features/ai-gateway/fns/gatewayModelPatterns";
import type { GatewayEnabledModels } from "@/src/features/ai-gateway/types/gatewayEnabledModels";

const PATTERN_HELP = [
  { type: "text", text: "Use " },
  { type: "code", text: "*" },
  { type: "text", text: " as a wildcard, e.g. " },
  { type: "code", text: "openai:gpt-5*" },
  { type: "text", text: ". Start with " },
  { type: "code", text: "-" },
  { type: "text", text: " to exclude, e.g. " },
  { type: "code", text: "-*opus*" },
  { type: "text", text: "." },
] as const;

type GatewayApiKeyModelsFieldProps<
  TFieldValues extends EditableGatewayApiKeyFields,
> = {
  control: Control<TFieldValues>;
  /** Undefined hides the allowed models preview. */
  enabledModels: GatewayEnabledModels | undefined;
};

export function GatewayApiKeyModelsField<
  TFieldValues extends EditableGatewayApiKeyFields,
>({ control, enabledModels }: GatewayApiKeyModelsFieldProps<TFieldValues>) {
  // Control is invariant in its form values, so a form that holds more fields
  // than these is narrowed to the slice this field edits.
  const { field } = useController({
    control: control as unknown as Control<EditableGatewayApiKeyFields>,
    name: "modelPatterns",
  });
  const patterns = field.value;
  const allowedModels = enabledModels?.models.filter((model) =>
    matchesGatewayModelPatterns(patterns, model.slug),
  );
  const unknownCatalogConnectionNames =
    enabledModels?.connections
      .filter((connection) => connection.isCatalogUnknown)
      .map((connection) => connection.name) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <CustomTooltip
        content={
          <span>
            Limits which models this key can call. Models an admin disables stay
            blocked.
          </span>
        }
      >
        {({ getTriggerProps }) => (
          <FormField
            label="Models"
            description={PATTERN_HELP}
            registerLabelTooltip={getTriggerProps}
          >
            {(formField) => (
              <ModelPatternsInput
                label="Models"
                describedById={formField.inputDescribedById}
                name={field.name}
                patterns={patterns}
                enabledModels={enabledModels}
                onPatternsChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
              />
            )}
          </FormField>
        )}
      </CustomTooltip>
      {patterns.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Allowed models: all enabled models, including ones added later
        </p>
      ) : null}
      {patterns.length > 0 && allowedModels ? (
        <AllowedModelsPreview
          models={allowedModels}
          unknownCatalogConnectionNames={unknownCatalogConnectionNames}
        />
      ) : null}
    </div>
  );
}
