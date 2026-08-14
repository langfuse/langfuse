import { useState, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { Popover, PopoverContent } from "@/src/components/ui/popover";
import { Skeleton } from "@/src/components/ui/skeleton";

type EvaluationRule = {
  id: string;
  name: string;
};

export function EvaluationRulePicker<Rule extends EvaluationRule>({
  children,
  open,
  defaultOpen = false,
  disabledRules,
  availableRules,
  loading = false,
  align = "start",
  search,
  onSearchChange,
  onOpenChange,
  onSelectAvailableRule,
  onCreateRule,
}: {
  children: (open: boolean) => ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  disabledRules: Array<{ rule: Rule; reason: string }>;
  availableRules: Rule[];
  loading?: boolean;
  align?: "start" | "center" | "end";
  /**
   * Provide together with `onSearchChange` to search server-side; the caller
   * then owns filtering, so more rules than one page are reachable.
   */
  search?: string;
  onSearchChange?: (search: string) => void;
  onOpenChange?: (open: boolean) => void;
  onSelectAvailableRule: (rule: Rule) => void;
  onCreateRule: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? internalOpen;

  const changeOpen = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const select = (action: () => void) => {
    changeOpen(false);
    action();
  };

  return (
    <Popover open={resolvedOpen} onOpenChange={changeOpen}>
      {children(resolvedOpen)}
      <PopoverContent
        align={align}
        className="w-96 p-0"
        onWheel={(event) => event.stopPropagation()}
      >
        <Command shouldFilter={onSearchChange === undefined}>
          <CommandInput
            placeholder="Find a rule..."
            value={search}
            onValueChange={onSearchChange}
          />
          <CommandList>
            <CommandEmpty>No rule found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="create new rule"
                onSelect={() => select(onCreateRule)}
              >
                <Plus className="h-4 w-4" />
                Create new rule
              </CommandItem>
            </CommandGroup>
            {disabledRules.length > 0 ? (
              <CommandGroup heading="Already attached">
                {disabledRules.map(({ rule, reason }) => (
                  <CommandItem
                    key={rule.id}
                    value={`${rule.name} ${rule.id}`}
                    disabled
                    title={reason}
                  >
                    <Check className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate" title={reason}>
                      {rule.name}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Available rules">
              {loading ? (
                <Skeleton className="m-2 h-16" />
              ) : (
                availableRules.map((rule) => (
                  <CommandItem
                    key={rule.id}
                    value={`${rule.name} ${rule.id}`}
                    onSelect={() => select(() => onSelectAvailableRule(rule))}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="truncate" title={rule.name}>
                      {rule.name}
                    </span>
                  </CommandItem>
                ))
              )}
              {!loading && availableRules.length === 0 ? (
                <div className="text-muted-foreground px-2 py-1.5 text-sm">
                  No rules available
                </div>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
