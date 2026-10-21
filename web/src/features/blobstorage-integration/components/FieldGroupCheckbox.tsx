import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { type ExportFieldGroup } from "@langfuse/shared";

// One export field group toggle. Required groups render checked and locked.
export const FieldGroupCheckbox = ({
  value,
  label,
  description,
  selected,
  onChange,
  required = false,
}: {
  value: ExportFieldGroup;
  label: string;
  description: string;
  selected: ExportFieldGroup[];
  onChange: (next: ExportFieldGroup[]) => void;
  required?: boolean;
}) => {
  const id = `field-group-${value}`;

  const handleCheckedChange = (checked: boolean | "indeterminate") => {
    if (checked !== true) {
      onChange(selected.filter((group) => group !== value));
      return;
    }
    if (selected.includes(value)) return;
    onChange([...selected, value]);
  };

  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={required || selected.includes(value)}
        disabled={required}
        onCheckedChange={required ? undefined : handleCheckedChange}
      />
      <label
        htmlFor={id}
        className={required ? "space-y-0.5" : "cursor-pointer space-y-0.5"}
      >
        <div className="text-sm leading-none font-bold">
          {label}
          {required && (
            <span className="text-muted-foreground ml-1 font-normal">
              (required)
            </span>
          )}
        </div>
        <div className="text-muted-foreground text-xs">{description}</div>
      </label>
    </div>
  );
};
