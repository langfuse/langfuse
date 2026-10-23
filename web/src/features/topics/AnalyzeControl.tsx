import { Button } from "@/src/components/design-system/Button/Button";
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

const DOT = { on: "bg-dark-green", paused: "bg-dark-yellow" };

/** Why the dialog cannot open, or null when it can. */
function automaticDisabledReason(
  state: AutomaticProcessingState,
  canWrite: boolean,
) {
  if (state.status === "unconfigured") return "Configure Topics first.";
  if (!canWrite) return "You need permission to edit Topics.";
  return null;
}

/** Off: an Analyze button. On or paused: the auto-analyze status. Both open the Analyze traces dialog. */
export function AnalyzeControl({
  canWrite,
  onClick,
  state,
}: AnalyzeControlProps) {
  const disabledReason = automaticDisabledReason(state, canWrite);
  if (state.status === "off" || state.status === "unconfigured") {
    return (
      <span title={disabledReason ?? undefined} className="inline-flex">
        <Button
          text="Analyze"
          size="sm"
          disabled={disabledReason !== null}
          onClick={onClick}
        />
      </span>
    );
  }
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
      {state.status === "on" ? "Auto-analyze: On" : "Auto-analyze: Paused"}
    </button>
  );
}
