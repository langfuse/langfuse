import {
  CalendarRange,
  Pencil,
  Plus,
  type IconComponent,
} from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { type TopicsActions } from "./prepare-topics-actions";

type EntryPoint = { onSelect: () => void; disabledReason?: string };

/** The page's map entry points, offered on phones where a question has no topics yet. */
export function TopicsEmptyActions({ actions }: { actions: TopicsActions }) {
  const editMap = actions.editRun;
  const candidates: Array<{
    label: string;
    icon: IconComponent;
    entry: EntryPoint | null;
  }> = [
    { label: "Edit map", icon: Pencil, entry: editMap },
    { label: "New map", icon: Plus, entry: actions.newMap },
    { label: "New snapshot", icon: CalendarRange, entry: actions.newSnapshot },
  ];
  const entries = candidates.flatMap(({ entry, ...item }) =>
    entry ? [{ ...item, entry }] : [],
  );
  // Touch screens never show a tooltip, so a disabled entry point spells out why.
  const reasons = [
    ...new Set(entries.flatMap(({ entry }) => entry.disabledReason ?? [])),
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {entries.map(({ label, icon, entry }) => (
          <Button
            key={label}
            text={label}
            icon={icon}
            variant="outline"
            disabled={Boolean(entry.disabledReason)}
            onClick={entry.onSelect}
          />
        ))}
      </div>
      {reasons.map((reason) => (
        <p key={reason} className="text-muted-foreground text-xs">
          {reason}
        </p>
      ))}
    </div>
  );
}
