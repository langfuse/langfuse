import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { type ExportFieldGroup } from "@langfuse/shared";

type FieldGroupCheckboxProps = {
  label: string;
  description: string;
} & (
  | {
      // Always exported: rendered checked and locked.
      required: true;
      id: string;
    }
  | {
      required?: false;
      value: ExportFieldGroup;
      selected: ExportFieldGroup[];
      onChange: (next: ExportFieldGroup[]) => void;
    }
);

/** Toggles one export field group; required groups render checked and locked. */
export const FieldGroupCheckbox = (props: FieldGroupCheckboxProps) => {
  const id = props.required ? props.id : `field-group-${props.value}`;

  const handleCheckedChange = (checked: boolean | "indeterminate") => {
    if (props.required) return;
    const { value, selected, onChange } = props;
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
        checked={props.required || props.selected.includes(props.value)}
        disabled={props.required}
        onCheckedChange={props.required ? undefined : handleCheckedChange}
      />
      <label
        htmlFor={id}
        className={
          props.required ? "space-y-0.5" : "cursor-pointer space-y-0.5"
        }
      >
        <div className="text-sm leading-none font-bold">
          {props.label}
          {props.required && (
            <span className="text-muted-foreground ml-1 font-normal">
              (required)
            </span>
          )}
        </div>
        <div className="text-muted-foreground text-xs">{props.description}</div>
      </label>
    </div>
  );
};
