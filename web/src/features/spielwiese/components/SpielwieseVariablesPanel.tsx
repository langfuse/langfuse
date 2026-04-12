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
        className="text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white/72 shadow-[0_0_0_1px_rgba(255,255,255,0.48)_inset] transition-[background-color,color,box-shadow] outline-none hover:bg-white/92 focus-visible:ring-2 focus-visible:ring-[rgba(15,23,42,0.08)] focus-visible:ring-offset-0"
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
      className="flex flex-col gap-2.5"
      data-testid="spielwiese-variables-panel"
    >
      <ul className="flex flex-col gap-2.5" role="list">
        {state.items.map((item, index) => (
          <SpielwieseVariableEditor
            item={item}
            itemIndex={index}
            key={item.id}
            onChange={state.onChange}
            onDelete={state.onDelete}
          />
        ))}
      </ul>
    </section>
  );
}
