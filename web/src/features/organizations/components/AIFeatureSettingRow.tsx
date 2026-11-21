import { type ReactNode } from "react";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { LockIcon } from "@langfuse/icons";

type AIFeatureSettingRowProps = {
  title: string;
  description: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Shows a "No access" lock next to the switch. */
  locked?: boolean;
};

export function AIFeatureSettingRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  locked,
}: AIFeatureSettingRowProps) {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h4 className="font-bold">{title}</h4>
        <p className="text-sm">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {locked && (
          <span title="No access">
            <LockIcon size="base" color="muted" />
          </span>
        )}
        <Switch
          aria-label={title}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
