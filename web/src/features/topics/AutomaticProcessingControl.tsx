import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { Button } from "@/src/components/design-system/Button/Button";
import {
  StatusBadge,
  type Status,
} from "@/src/components/ui/StatusBadge/StatusBadge";

/**
 * Topics header status for automatic processing. Turning it on or off and the
 * sampling rate happen in the dialog it opens, next to the models that run.
 */
export function AutomaticProcessingControl({
  canWrite,
  onOpen,
  state,
}: AutomaticProcessingControlProps) {
  const reason = disabledReason(state, canWrite);
  const button = (
    <Button
      text="Automatic processing"
      size="sm"
      variant={
        state.status === "off" || state.status === "paused"
          ? "primary"
          : "secondary"
      }
      disabled={reason !== null}
      onClick={onOpen}
    />
  );
  return (
    <div className="flex shrink-0 items-center gap-1">
      <div
        role="status"
        aria-label={`Automatic processing: ${statusLabel(state)}`}
      >
        <StatusBadge type={badgeStatus(state)} showText={false}>
          {statusLabel(state)}
        </StatusBadge>
      </div>
      {reason ? (
        <Tooltip label={state.status === "paused" ? state.shortLabel : reason}>
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

function badgeStatus(state: AutomaticProcessingState): Status {
  if (state.status === "on") return "active";
  if (state.status === "paused") return "paused";
  return "inactive";
}

function statusLabel(state: AutomaticProcessingState) {
  if (state.status === "on") return "On";
  if (state.status === "paused") return "Paused";
  return "Off";
}

function disabledReason(state: AutomaticProcessingState, canWrite: boolean) {
  if (state.status === "unconfigured") return "Configure Topics first.";
  if (state.status === "unavailable")
    return "Topics processing is not enabled for this project.";
  if (!canWrite) return "You need permission to edit Topics.";
  return null;
}

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "unavailable" }
  | { status: "off" }
  | { status: "on" }
  | { status: "paused"; shortLabel: string };

type AutomaticProcessingControlProps = {
  state: AutomaticProcessingState;
  canWrite: boolean;
  onOpen: () => void;
};
