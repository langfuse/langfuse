import { cn } from "@/src/utils/tailwind";

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "off" }
  | { status: "on" }
  | { status: "paused"; shortLabel: string };

type AnalyzeControlProps = {
  state: AutomaticProcessingState;
  canWrite: boolean;
  onClick: () => void;
};

const LABEL: Record<AutomaticProcessingState["status"], string> = {
  unconfigured: "Off",
  off: "Off",
  on: "On",
  paused: "Paused",
};

const DOT: Record<AutomaticProcessingState["status"], string> = {
  unconfigured: "bg-muted-foreground",
  off: "bg-muted-foreground",
  on: "bg-dark-green",
  paused: "bg-dark-yellow",
};

/** Why the dialog cannot open, or null when it can. */
function automaticDisabledReason(
  state: AutomaticProcessingState,
  canWrite: boolean,
) {
  if (state.status === "unconfigured") return "Configure Topics first.";
  if (!canWrite) return "You need permission to edit Topics.";
  return null;
}

/** Topics header status control; opens the Analyze traces dialog. */
export function AnalyzeControl({
  canWrite,
  onClick,
  state,
}: AnalyzeControlProps) {
  const disabledReason = automaticDisabledReason(state, canWrite);
  const title =
    state.status === "paused"
      ? state.shortLabel
      : (disabledReason ?? undefined);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabledReason !== null}
      title={title}
      className="text-muted-foreground hover:bg-accent hover:text-foreground ring-offset-background focus-visible:ring-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
    >
      <span
        aria-hidden
        className={cn("inline-flex size-2 rounded-full", DOT[state.status])}
      />
      Auto-analyze: {LABEL[state.status]}
    </button>
  );
}
