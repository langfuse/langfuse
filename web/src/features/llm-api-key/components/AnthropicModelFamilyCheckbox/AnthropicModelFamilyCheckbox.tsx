import { useId } from "react";
import { InfoIcon } from "@langfuse/icons";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

const TOOLTIP_LABEL =
  "Tick this if the model is Claude but its name doesn't say so, e.g. an inference profile ARN. Without it, LLM-as-a-judge evaluators may fail.";

export type AnthropicModelFamilyCheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function AnthropicModelFamilyCheckbox({
  checked,
  onCheckedChange,
}: AnthropicModelFamilyCheckboxProps) {
  const id = useId();

  const handleCheckedChange = (value: boolean | "indeterminate") =>
    onCheckedChange(value === true);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={handleCheckedChange}
      />
      <label htmlFor={id} className="text-sm whitespace-nowrap">
        Anthropic model
      </label>
      <Tooltip label={TOOLTIP_LABEL}>
        {({ getTriggerProps }) => (
          <IconButton
            icon={InfoIcon}
            label="About Anthropic model"
            size="xs"
            {...getTriggerProps()}
          />
        )}
      </Tooltip>
    </div>
  );
}
