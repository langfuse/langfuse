import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import {
  StatusBadge,
  type Status,
} from "@/src/components/ui/StatusBadge/StatusBadge";
import { cn } from "@/src/utils/tailwind";

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
    <button
      type="button"
      className={cn(
        "ring-offset-background focus-visible:ring-ring inline-flex h-7 shrink-0 items-center rounded-md pr-2 text-xs whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        state.status === "off" || state.status === "paused"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      )}
      aria-label={`Automatic processing: ${statusLabel(state)}`}
      disabled={reason !== null}
      onClick={onOpen}
    >
      <span aria-hidden className="inline-flex shrink-0">
        <StatusBadge
          type={badgeStatus(state)}
          variant="transparent"
          showText={false}
        />
      </span>
      Automatic processing
    </button>
  );
  if (!reason) return button;
  return (
    <Tooltip label={state.status === "paused" ? state.shortLabel : reason}>
      {({ getTriggerProps }) => <span {...getTriggerProps()}>{button}</span>}
    </Tooltip>
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
