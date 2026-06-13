// Presentational autocomplete listbox: a pure ARIA listbox over a
// CompletionPlan. No context, no data fetching — it renders sections/options
// and reports picks/highlights to the parent. The live composer wraps it in
// AutocompletePopover (positioning); Storybook renders it directly.

import * as React from "react";
import { Check, Clock, Parentheses, Search } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import type {
  CompletionOption,
  CompletionPlan,
} from "@/src/features/search-bar/lib/completions";
import { optionDomId } from "@/src/features/search-bar/components/presentation";

function OptionIcon({ kind }: { kind: CompletionOption["kind"] }) {
  const cls = "h-3.5 w-3.5 flex-none opacity-55";
  if (kind === "recent") return <Clock className={cls} aria-hidden />;
  if (kind === "operator" || kind === "pattern")
    return <Parentheses className={cls} aria-hidden />;
  return <Search className={cls} aria-hidden />;
}

export type AutocompleteListboxProps = {
  plan: CompletionPlan;
  highlightedId: string | null;
  onPick?: (option: CompletionOption) => void;
  onHighlight?: (id: string) => void;
  listboxId?: string;
};

export function AutocompleteListbox({
  plan,
  highlightedId,
  onPick,
  onHighlight,
  listboxId = "search-bar-listbox",
}: AutocompleteListboxProps) {
  // Hover may only highlight on REAL pointer movement. When the list
  // re-renders under a stationary mouse (typing/pasting grows the popover),
  // Chromium fires synthetic mouseover events — honoring those would arm
  // Enter with an option the user never chose (keyboard keeps authority).
  const lastPointer = React.useRef<{ x: number; y: number } | null>(null);
  const highlightOnMove = onHighlight
    ? (id: string) => (e: React.MouseEvent) => {
        const last = lastPointer.current;
        if (last !== null && last.x === e.clientX && last.y === e.clientY)
          return;
        lastPointer.current = { x: e.clientX, y: e.clientY };
        onHighlight(id);
      }
    : undefined;
  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Search suggestions"
      data-testid="search-bar-autocomplete"
      data-stage={plan.stage}
      className={cn(
        "w-max max-w-[calc(100vw-16px)] min-w-[min(420px,calc(100vw-16px))]",
        "max-h-[min(420px,40vh)] overflow-x-hidden overflow-y-auto",
        "bg-popover text-popover-foreground rounded-md border py-1 shadow-md",
      )}
    >
      {plan.loading && (
        <div
          data-testid="search-bar-autocomplete-loading"
          className="text-muted-foreground mx-1 flex min-h-8 items-center gap-2 px-3 text-xs"
        >
          Loading values…
        </div>
      )}
      {!plan.loading && plan.sections.length === 0 && (
        <div className="text-muted-foreground mx-1 flex min-h-8 items-center gap-2 px-3 text-xs">
          No suggestions
        </div>
      )}
      {plan.sections.map((sec, i) => (
        <div
          key={sec.title}
          role="group"
          aria-label={sec.title}
          className={cn(i > 0 && "mt-1.5 border-t pt-1.5")}
        >
          <div
            data-testid="search-bar-autocomplete-section"
            className="text-muted-foreground px-3 pt-1.5 pb-1 text-[10px] tracking-[0.06em] uppercase"
          >
            {sec.title}
          </div>
          {sec.options.map((o) => (
            <div
              key={o.id}
              id={optionDomId(listboxId, o.id)}
              role="option"
              aria-selected={o.id === highlightedId}
              data-option-id={o.id}
              className={cn(
                "mx-1 flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-2",
                "font-mono text-xs leading-[1.4]",
                o.id === highlightedId
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
              // mousedown must not blur the composer input mid-pick
              onMouseDown={(e) => e.preventDefault()}
              onClick={onPick ? () => onPick(o) : undefined}
              onMouseMove={highlightOnMove?.(o.id)}
            >
              <OptionIcon kind={o.kind} />
              <span className="max-w-[480px] min-w-0 flex-none truncate">
                {o.label}
              </span>
              {o.kind === "value" && o.active && (
                <Check
                  className="text-foreground/80 h-3.5 w-3.5 flex-none"
                  aria-label="selected"
                />
              )}
              {"detail" in o && o.detail !== undefined && (
                <span className="text-muted-foreground ml-auto pl-6 font-sans text-[11px]">
                  {o.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
