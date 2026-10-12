import { Switch } from "@/src/components/design-system/Switch/Switch";

export function ModelEnabledSwitch({
  model,
  enabled,
  disabled,
  onToggle,
}: {
  model: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: (model: string, enabled: boolean) => void;
}) {
  const handleCheckedChange = (checked: boolean) => onToggle(model, checked);

  return (
    <Switch
      checked={enabled}
      disabled={disabled}
      aria-label={`${enabled ? "Disable" : "Enable"} ${model}`}
      onCheckedChange={handleCheckedChange}
    />
  );
}
