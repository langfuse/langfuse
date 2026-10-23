import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";

/**
 * Topics header entry to analysis. With automatic analysis on it shows that
 * status and opens its dialog; otherwise it starts a one-off run.
 */
export function AnalyzeControl({
  manualAvailable,
  onAutomatic,
  onManual,
  state,
}: AnalyzeControlProps) {
  if (state.status === "on" || state.status === "paused") {
    return (
      <button
        type="button"
        onClick={onAutomatic}
        title={state.status === "paused" ? state.shortLabel : undefined}
        className="text-muted-foreground hover:bg-accent hover:text-foreground ring-offset-background focus-visible:ring-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex size-2 rounded-full",
            state.status === "on" ? "bg-dark-green" : "bg-dark-yellow",
          )}
        />
        {state.status === "on" ? "Auto-analyze on" : "Auto-analyze paused"}
      </button>
    );
  }
  return (
    <Button
      text="Analyze traces"
      size="sm"
      disabled={!manualAvailable}
      onClick={onManual}
    />
  );
}

/** Why the automatic analysis dialog cannot open, or null when it can. */
export function automaticDisabledReason(
  state: AutomaticProcessingState,
  canWrite: boolean,
) {
  if (state.status === "unconfigured") return "Configure Topics first.";
  if (!canWrite) return "You need permission to edit Topics.";
  return null;
}

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "off" }
  | { status: "on" }
  | { status: "paused"; shortLabel: string };

type AnalyzeControlProps = {
  state: AutomaticProcessingState;
  manualAvailable: boolean;
  onAutomatic: () => void;
  onManual: () => void;
};
