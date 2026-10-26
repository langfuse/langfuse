import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { Button } from "@/src/components/design-system/Button/Button";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { type AutomaticProcessingAction } from "./prepare-topics-actions";

/** Status and dialog trigger for the automatic-processing action. */
export function AutomaticProcessingControl({
  action,
}: {
  action: AutomaticProcessingAction;
}) {
  const button = (
    <Button
      text={action.label}
      size="sm"
      variant={action.variant}
      disabled={Boolean(action.disabledReason)}
      onClick={action.onSelect}
    />
  );
  return (
    <div className="flex shrink-0 items-center gap-1">
      <div role="status" aria-label={`${action.label}: ${action.badge}`}>
        <StatusBadge type={action.badgeStatus} showText={false}>
          {action.badge}
        </StatusBadge>
      </div>
      {action.disabledReason ? (
        <Tooltip label={action.disabledReason}>
          {({ getTriggerProps }) => (
            <span {...getTriggerProps()}>{button}</span>
          )}
        </Tooltip>
      ) : (
        button
      )}
    </div>
  );
}
