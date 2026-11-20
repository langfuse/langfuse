import type { ChangeEvent } from "react";

type PresetOptionProps<TValue extends string> = {
  name: string;
  value: TValue;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: (value: TValue) => void;
};

/** A native radio drawn as an outline button, so the checked preset is announced. */
export function PresetOption<TValue extends string>({
  name,
  value,
  label,
  checked,
  disabled,
  onSelect,
}: PresetOptionProps<TValue>) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) onSelect(value);
  };

  return (
    <label className="border-border-contrast bg-background ring-offset-background hover:bg-accent hover:text-accent-foreground has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-checked:hover:bg-primary/90 has-focus-visible:ring-ring inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm whitespace-nowrap transition-colors has-focus-visible:ring-2 has-focus-visible:ring-offset-2 has-disabled:pointer-events-none has-disabled:opacity-50">
      <input
        type="radio"
        className="sr-only"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
      />
      {label}
    </label>
  );
}
