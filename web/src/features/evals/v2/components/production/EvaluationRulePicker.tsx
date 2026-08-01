import { useState, type ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";

type EvaluationRule = {
  id: string;
  name: string;
};

export function EvaluationRulePicker<Rule extends EvaluationRule>({
  trigger,
  attachedRules = [],
  availableRules,
  selectedRuleId,
  loading = false,
  align = "start",
  onOpenChange,
  onSelectAttachedRule,
  onSelectAvailableRule,
  onCreateRule,
  onClearSelection,
}: {
  trigger: (open: boolean) => ReactNode;
  attachedRules?: Rule[];
  availableRules: Rule[];
  selectedRuleId?: string | null;
  loading?: boolean;
  align?: "start" | "center" | "end";
  onOpenChange?: (open: boolean) => void;
  onSelectAttachedRule?: (rule: Rule) => void;
  onSelectAvailableRule: (rule: Rule) => void;
  onCreateRule: () => void;
  onClearSelection?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const select = (action: () => void) => {
    changeOpen(false);
    action();
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{trigger(open)}</PopoverTrigger>
      <PopoverContent align={align} className="w-96 p-0">
        <Command>
          <CommandInput placeholder="Find a rule..." />
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
            {onClearSelection ? (
              <CommandGroup>
                <CommandItem
                  value="clear selected rule"
                  onSelect={() => select(onClearSelection)}
                >
                  <X className="h-4 w-4" />
                  <span>Clear selection</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {onSelectAttachedRule && attachedRules.length > 0 ? (
              <CommandGroup heading="Evaluator attached to">
                {attachedRules.map((rule) => (
                  <CommandItem
                    key={rule.id}
                    value={`${rule.name} ${rule.id}`}
                    onSelect={() => select(() => onSelectAttachedRule(rule))}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        selectedRuleId === rule.id
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate" title={rule.name}>
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
                  This evaluator is attached to all available rules
                </div>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
