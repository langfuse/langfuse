import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";
import { type AutomaticProcessingState } from "./prepare-topics-actions";

type AnalyzeControlProps = {
  state: AutomaticProcessingState;
  /** Why the dialog cannot open; absent when it can. */
  disabledReason?: string;
  onClick: () => void;
};

const DOT = { on: "bg-dark-green", paused: "bg-dark-yellow" };

/** Off: an Analyze button. On or paused: the auto-analyze status. Both open the Analyze traces dialog. */
export function AnalyzeControl({
  disabledReason,
  onClick,
  state,
}: AnalyzeControlProps) {
  if (state.status === "off" || state.status === "unconfigured") {
    return (
      <span title={disabledReason} className="inline-flex">
        <Button
          text="Analyze"
          size="sm"
          disabled={Boolean(disabledReason)}
          onClick={onClick}
        />
      </span>
    );
  }
  const title =
    disabledReason ??
    (state.status === "paused" ? state.shortLabel : undefined);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(disabledReason)}
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
