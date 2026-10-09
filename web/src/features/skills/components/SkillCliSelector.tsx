import { useId, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

export function SkillCliSelector({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string;
  options: { value: string; label: ReactNode }[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="ph-no-capture flex min-w-0 flex-col gap-2">
      <label className="text-muted-foreground text-xs" htmlFor={id}>
        {label}
      </label>
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={options.length === 0}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue
            placeholder={
              options.length
                ? `Select ${label.toLowerCase()}`
                : "No skills available"
            }
          />
        </SelectTrigger>
        <SelectContent className="ph-no-capture">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
