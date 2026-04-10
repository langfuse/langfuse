import { ListPlus, Type, Variable } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type {
  SpielwieseDashboardVM,
  SpielwieseVariableVM,
} from "../types/dashboard";

type SpielwieseVariablesPanelProps = {
  variablesPanel: SpielwieseDashboardVM["variablesPanel"];
};

function getToneClassNames(tone: SpielwieseVariableVM["tone"]) {
  if (tone === "green") {
    return {
      hover: "hover:bg-light-green/60",
      icon: "text-dark-green",
      active: "bg-light-green/70",
      text: "text-dark-green",
    };
  }

  if (tone === "yellow") {
    return {
      hover: "hover:bg-light-yellow/60",
      icon: "text-dark-yellow",
      active: "bg-light-yellow/70",
      text: "text-dark-yellow",
    };
  }

  return {
    hover: "hover:bg-light-blue/60",
    icon: "text-dark-blue",
    active: "bg-light-blue/70",
    text: "text-dark-blue",
  };
}

function VariableRow({ item }: { item: SpielwieseVariableVM }) {
  const toneClassNames = getToneClassNames(item.tone);

  return (
    <li className="list-none">
      <button
        className={cn(
          "focus-visible:ring-ring/40 flex w-full flex-col items-start gap-1 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2",
          item.isActive ? toneClassNames.active : toneClassNames.hover,
        )}
        type="button"
      >
        <span className="flex w-full items-center justify-between gap-3">
          <span
            className={cn(
              "truncate text-sm font-semibold",
              toneClassNames.text,
            )}
          >
            {item.label}
          </span>
          <Type className={cn("size-3.5 shrink-0", toneClassNames.icon)} />
        </span>
        <span
          className={cn(
            "truncate text-sm",
            item.isActive ? toneClassNames.text : "text-muted-foreground",
          )}
        >
          {item.helper}
        </span>
      </button>
    </li>
  );
}

export function SpielwieseVariablesPanel({
  variablesPanel,
}: SpielwieseVariablesPanelProps) {
  return (
    <section
      className="flex flex-col gap-3"
      data-testid="spielwiese-variables-panel"
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <Variable className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate text-sm font-semibold">
            {variablesPanel.countLabel}
          </span>
        </div>

        <button
          aria-label={variablesPanel.actionLabel}
          className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/40 inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
          type="button"
        >
          <ListPlus className="size-4" />
        </button>
      </div>

      <ul className="flex flex-col gap-1" role="list">
        {variablesPanel.items.map((item) => (
          <VariableRow item={item} key={item.id} />
        ))}
      </ul>
    </section>
  );
}
