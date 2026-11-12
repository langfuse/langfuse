import { useState, type ChangeEvent, type KeyboardEvent } from "react";
import { X } from "@langfuse/icons";
import { useController, type Control } from "react-hook-form";

import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tag } from "@/src/components/design-system/Tag/Tag";
import { AllowedModelsPreview } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/components/AllowedModelsPreview/AllowedModelsPreview";
import { ModelPatternTag } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/components/ModelPatternTag/ModelPatternTag";
import { addGatewayModelPatterns } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/fns/addGatewayModelPatterns";
import type { CreateGatewayApiKeyFormValues } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/types/createGatewayApiKeyFormSchema";
import { matchesGatewayModelPatterns } from "@/src/features/ai-gateway/fns/matchesGatewayModelPatterns";
import type { GatewayEnabledModel } from "@/src/features/ai-gateway/types/gatewayEnabledModel";

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

type GatewayApiKeyModelsFieldProps = {
  control: Control<CreateGatewayApiKeyFormValues>;
  /** Undefined hides the allowed models preview. */
  enabledModels: GatewayEnabledModel[] | undefined;
};

export function GatewayApiKeyModelsField({
  control,
  enabledModels,
}: GatewayApiKeyModelsFieldProps) {
  const { field } = useController({ control, name: "modelPatterns" });
  const [draft, setDraft] = useState("");
  const patterns = field.value;

  const commitDraft = () => {
    if (!draft.trim()) return;
    field.onChange(addGatewayModelPatterns(patterns, draft));
    setDraft("");
  };

  const handleDraftChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.value.includes(",")) {
      setDraft(event.target.value);
      return;
    }
    field.onChange(addGatewayModelPatterns(patterns, event.target.value));
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Backspace" && draft === "" && patterns.length > 0) {
      event.preventDefault();
      field.onChange(patterns.slice(0, -1));
    }
  };

  const handleBlur = () => {
    commitDraft();
    field.onBlur();
  };

  const handleRemove = (pattern: string) =>
    field.onChange(patterns.filter((item) => item !== pattern));

  const handleClear = () => {
    field.onChange([]);
    setDraft("");
  };

  const allowedModels = enabledModels?.filter((model) =>
    matchesGatewayModelPatterns(
      patterns.length > 0 ? patterns : null,
      model.slug,
    ),
  );

  return (
    <div className="flex flex-col gap-3">
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
              <div className="border-input bg-background focus-within:ring-ring flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-2 py-1.5 focus-within:ring-2">
                {patterns.length === 0 ? (
                  <Tag text="All enabled models" />
                ) : (
                  patterns.map((pattern) => (
                    <ModelPatternTag
                      key={pattern}
                      pattern={pattern}
                      onRemove={handleRemove}
                    />
                  ))
                )}
                <input
                  id={formField.id}
                  aria-describedby={formField.inputDescribedById}
                  className="placeholder:text-muted-foreground min-w-40 flex-1 bg-transparent text-sm outline-hidden"
                  placeholder="Add models, connections or patterns"
                  name={field.name}
                  value={draft}
                  onChange={handleDraftChange}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  ref={field.ref}
                />
                {patterns.length > 0 ? (
                  <IconButton
                    icon={X}
                    label="Clear models"
                    size="sm"
                    onClick={handleClear}
                  />
                ) : null}
              </div>
            )}
          </FormField>
        )}
      </CustomTooltip>
      {allowedModels ? <AllowedModelsPreview models={allowedModels} /> : null}
    </div>
  );
}
