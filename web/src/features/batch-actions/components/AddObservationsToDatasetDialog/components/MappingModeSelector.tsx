import { Label } from "@/src/components/ui/label";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import type { MappingMode } from "../types";

type MappingModeSelectorProps = {
  value: MappingMode;
  onChange: (mode: MappingMode) => void;
  fullLabel: string; // e.g., "Full observation input"
  fieldName: string; // e.g., "input", "output", "metadata"
};

export function MappingModeSelector({
  value,
  onChange,
  fullLabel,
  fieldName,
}: MappingModeSelectorProps) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as MappingMode)}>
      <div className="hover:bg-muted/50 flex items-center space-x-3 rounded-md border px-3">
        <RadioGroup.Item value="full" id={`${fieldName}-full`} />
        <Label
          htmlFor={`${fieldName}-full`}
          className="flex-1 cursor-pointer py-3 text-sm font-bold"
        >
          {fullLabel}
        </Label>
      </div>
      <div className="hover:bg-muted/50 flex items-center space-x-3 rounded-md border px-3">
        <RadioGroup.Item value="custom" id={`${fieldName}-custom`} />
        <Label
          htmlFor={`${fieldName}-custom`}
          className="flex-1 cursor-pointer py-3 text-sm font-bold"
        >
          Custom mapping
        </Label>
      </div>
      {fieldName !== "input" && (
        <div className="hover:bg-muted/50 flex items-center space-x-3 rounded-md border px-3">
          <RadioGroup.Item
            value="none"
            id={`${fieldName}-none`}
            disabled={fieldName === "input"}
          />
          <Label
            htmlFor={`${fieldName}-none`}
            className="flex-1 cursor-pointer py-3 text-sm font-bold"
          >
            None
          </Label>
        </div>
      )}
    </RadioGroup>
  );
}
