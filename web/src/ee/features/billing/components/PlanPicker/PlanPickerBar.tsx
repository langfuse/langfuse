import { type PlanDueCell } from "@/src/ee/features/billing/fns/planChangeDue";

type PlanPickerBarProps = { cells: ReadonlyArray<PlanDueCell> };

/** What is due today and what the plan costs from when, above the picker's buttons. */
export function PlanPickerBar({ cells }: PlanPickerBarProps) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-xs">{cell.label}</dt>
          <dd className="font-bold tabular-nums">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
