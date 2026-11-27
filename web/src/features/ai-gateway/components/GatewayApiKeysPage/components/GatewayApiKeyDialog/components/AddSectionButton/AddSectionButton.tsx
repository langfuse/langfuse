import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { DisabledActionTooltip } from "@/src/components/design-system/DisabledActionTooltip/DisabledActionTooltip";

type AddSectionButtonProps = {
  label: string;
  /** Disables the button and explains why on hover. */
  disabledReason?: string;
  onAdd: () => void;
};

/** Adds an optional section to the key form. */
export function AddSectionButton({
  label,
  disabledReason,
  onAdd,
}: AddSectionButtonProps) {
  if (disabledReason === undefined) {
    return (
      <Button text={label} icon={Plus} variant="outline" onClick={onAdd} />
    );
  }
  return (
    <DisabledActionTooltip label={disabledReason}>
      <Button text={label} icon={Plus} variant="outline" disabled />
    </DisabledActionTooltip>
  );
}
