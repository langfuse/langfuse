import { Switch } from "@/src/components/design-system/Switch/Switch";

export type ModelEnabledSwitchProps = {
  model: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: (model: string, enabled: boolean) => void;
};

export function ModelEnabledSwitch({
  model,
  enabled,
  disabled,
  onToggle,
}: ModelEnabledSwitchProps) {
  const handleCheckedChange = (checked: boolean) => onToggle(model, checked);

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Switch
        color="green"
        checked={enabled}
        disabled={disabled}
        aria-label={`${enabled ? "Disable" : "Enable"} ${model}`}
        onCheckedChange={handleCheckedChange}
      />
    </div>
  );
}
