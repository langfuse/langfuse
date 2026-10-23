/* eslint-disable @typescript-eslint/no-use-before-define */
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { cn } from "@/src/utils/tailwind";

/**
 * Topics header entry to analysis. Turning automatic analysis on or off and
 * the sampling rate happen in the dialog it opens, next to the models that run.
 */
export function AnalyzeMenu({
  canWrite,
  manualAvailable,
  onAutomatic,
  onManual,
  state,
}: AnalyzeMenuProps) {
  const reason = automaticDisabledReason(state, canWrite);
  const items: DropdownMenuItemDefinition[] = [
    {
      id: "automatic",
      type: "item",
      title: "Analyze new traces automatically…",
      disabled: reason ? { reason } : undefined,
      onClick: onAutomatic,
    },
  ];
  if (manualAvailable) {
    items.push({
      id: "manual",
      type: "item",
      title: "Analyze traces now…",
      onClick: onManual,
    });
  }
  return (
    <DropdownMenu ariaLabel="Analyze" placement="bottom-end" items={items}>
      {({ getTriggerProps }) => (
        <button
          {...getTriggerProps()}
          type="button"
          title={state.status === "paused" ? state.shortLabel : undefined}
          className="bg-secondary text-secondary-foreground hover:bg-secondary/80 ring-offset-background focus-visible:ring-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
        >
          <span
            aria-hidden
            className={cn("inline-flex h-2 w-2 rounded-full", dotColor(state))}
          />
          {`Analyze: ${statusLabel(state)}`}
          <DropdownIndicator size="sm" color="inherit" />
        </button>
      )}
    </DropdownMenu>
  );
}

// Same colors as the StatusBadge dot for active, paused and inactive.
function dotColor(state: AutomaticProcessingState) {
  if (state.status === "on") return "bg-dark-green";
  if (state.status === "paused") return "bg-dark-yellow";
  return "bg-muted-foreground";
}

function statusLabel(state: AutomaticProcessingState) {
  if (state.status === "on") return "On";
  if (state.status === "paused") return "Paused";
  return "Off";
}

function automaticDisabledReason(
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

type AnalyzeMenuProps = {
  state: AutomaticProcessingState;
  canWrite: boolean;
  manualAvailable: boolean;
  onAutomatic: () => void;
  onManual: () => void;
};
