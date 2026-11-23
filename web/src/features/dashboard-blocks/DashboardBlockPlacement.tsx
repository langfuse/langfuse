import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Label } from "@/src/components/ui/label";
import { useId } from "react";

export function DashboardBlockPlacement({
  value,
  options,
  disabled,
  defaultExpanded = false,
  onChange,
}: {
  value: string | null;
  options: { value: string | null; label: string }[];
  disabled: boolean;
  defaultExpanded?: boolean;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  const encode = (value: string | null) =>
    JSON.stringify(value === null ? ["after"] : ["before", value]);
  const selectOptions = options.map((option) => ({
    value: encode(option.value),
    label: option.label,
  }));
  const selected = options.some((option) => option.value === value)
    ? value
    : null;
  return (
    <div className="ph-no-capture">
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultExpanded ? "position" : undefined}
      >
        <Accordion.Item value="position">
          <Accordion.Trigger size="sm">
            <span className="text-muted-foreground text-left font-normal">
              Position:{" "}
              {options.find((option) => option.value === selected)?.label ??
                "After all chart rows"}
            </span>
          </Accordion.Trigger>
          <Accordion.Content>
            <div className="flex flex-col gap-1.5 py-2">
              <Label htmlFor={id}>Position</Label>
              <SelectInput
                id={id}
                value={encode(selected)}
                options={selectOptions}
                placeholder="After all chart rows"
                disabled={disabled}
                noCapture
                onValueChange={(next) => {
                  const option = options.find(
                    (option) => encode(option.value) === next,
                  );
                  if (option) onChange(option.value);
                }}
              />
              <p className="text-muted-foreground text-xs">
                Placed before the whole chart row. If that chart is removed,
                this block appears after the remaining rows.
              </p>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
