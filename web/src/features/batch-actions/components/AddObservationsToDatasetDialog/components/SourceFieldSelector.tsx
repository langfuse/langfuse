import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import type { SourceField } from "../types";

type SourceFieldSelectorProps = {
  value: SourceField;
  onChange: (field: SourceField) => void;
  disabled?: boolean;
};

export function SourceFieldSelector({
  value,
  onChange,
  disabled = false,
}: SourceFieldSelectorProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as SourceField)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="input">Input</SelectItem>
        <SelectItem value="output">Output</SelectItem>
        <SelectItem value="metadata">Metadata</SelectItem>
      </SelectContent>
    </Select>
  );
}
