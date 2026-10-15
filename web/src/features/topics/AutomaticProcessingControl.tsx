import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { Circle, CircleCheck, CirclePause } from "lucide-react";
import { Button } from "@/src/components/design-system/Button/Button";

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
      text={`Automatic processing: ${statusLabel(state)}`}
      icon={statusIcon(state)}
      variant={
        state.status === "off" || state.status === "paused"
          ? "primary"
          : "secondary"
      }
      size="sm"
      disabled={reason !== null}
      onClick={onOpen}
    />
  );
  if (!reason) return button;
  return (
    <Tooltip label={state.status === "paused" ? state.shortLabel : reason}>
      {({ getTriggerProps }) => <span {...getTriggerProps()}>{button}</span>}
    </Tooltip>
  );
}

function statusIcon(state: AutomaticProcessingState) {
  if (state.status === "on") return CircleCheck;
  if (state.status === "paused") return CirclePause;
  return Circle;
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
