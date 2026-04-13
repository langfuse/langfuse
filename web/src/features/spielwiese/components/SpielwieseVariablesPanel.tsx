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
    <div
      className="flex items-center justify-between gap-3"
      data-testid="spielwiese-variables-summary"
    >
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="text-foreground/52 inline-flex size-7 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(15,23,42,0.06)] bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]"
          data-testid="spielwiese-variables-summary-icon-shell"
        >
          <Variable className="size-3.5 shrink-0" />
        </div>
        <div className="text-foreground/84 min-w-0 truncate text-[0.8125rem] font-medium tracking-[-0.01em]">
          {getVariableCountLabel(count)}
        </div>
      </div>

      <button
        aria-label={actionLabel}
        className="text-foreground/68 hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-[10px] border-0 bg-transparent shadow-none transition-[background-color,color] outline-none hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-[rgba(15,23,42,0.08)] focus-visible:ring-offset-0"
        data-testid="spielwiese-variables-summary-action"
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
