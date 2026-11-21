import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

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
    // Disabled buttons fire no pointer events, so the tooltip listens on a wrapper.
    <Tooltip label={disabledReason}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          className="inline-flex cursor-not-allowed [&>button]:pointer-events-none"
        >
          <Button text={label} icon={Plus} variant="outline" disabled />
        </span>
      )}
    </Tooltip>
  );
}
