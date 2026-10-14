import { Button } from "@/src/components/design-system/Button/Button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

export function RegenerateTopicsButton({
  disabledReason,
  onClick,
}: {
  disabledReason: string | null;
  onClick: () => void;
}) {
  const button = (
    <Button
      text="Regenerate topics"
      size="sm"
      variant="secondary"
      disabled={disabledReason !== null}
      onClick={onClick}
    />
  );
  if (disabledReason === null) return button;
  return (
    <Tooltip label={disabledReason} placement="bottom">
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} tabIndex={0} aria-label={disabledReason}>
          {button}
        </span>
      )}
    </Tooltip>
  );
}
