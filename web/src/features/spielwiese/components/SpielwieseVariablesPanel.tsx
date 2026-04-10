import { ListPlus, Variable } from "lucide-react";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseVariableEditor } from "./SpielwieseVariableEditor";
import { getVariableCountLabel } from "./spielwieseVariablesPanelState";
import type { SpielwieseVariablesPanelState } from "./useSpielwieseVariablesPanelState";

type SpielwieseVariablesSummaryProps = {
  actionLabel: SpielwieseDashboardVM["variablesPanel"]["actionLabel"];
  count: number;
  onCreate: () => void;
};

export function SpielwieseVariablesSummary({
  actionLabel,
  count,
  onCreate,
}: SpielwieseVariablesSummaryProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Variable className="text-muted-foreground size-4 shrink-0" />
        <div className="truncate text-sm font-semibold">
          {getVariableCountLabel(count)}
        </div>
      </div>

      <button
        aria-label={actionLabel}
        className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/40 inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
        onClick={onCreate}
        type="button"
      >
        <ListPlus className="size-4" />
      </button>
    </div>
  );
}

type SpielwieseVariablesPanelProps = {
  state: SpielwieseVariablesPanelState;
};

export function SpielwieseVariablesPanel({
  state,
}: SpielwieseVariablesPanelProps) {
  return (
    <section
      className="flex flex-col gap-3"
      data-testid="spielwiese-variables-panel"
    >
      <ul className="flex flex-col gap-1" role="list">
        {state.items.map((item) => (
          <SpielwieseVariableEditor
            item={item}
            key={item.id}
            onChange={state.onChange}
            onDelete={state.onDelete}
          />
        ))}
      </ul>
    </section>
  );
}
