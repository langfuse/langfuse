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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Skeleton } from "@/src/components/ui/skeleton";

type EvaluationRule = {
  id: string;
  name: string;
};

function EvaluationRulePickerController({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children}
    </Popover>
  );
}

export function EvaluationRulePicker<Rule extends EvaluationRule>({
  trigger,
  open,
  defaultOpen = false,
  disabledRules,
  availableRules,
  loading = false,
  align = "start",
  onOpenChange,
  onSelectAvailableRule,
  onCreateRule,
}: {
  trigger: (open: boolean) => ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  disabledRules: Array<{ rule: Rule; reason: string }>;
  availableRules: Rule[];
  loading?: boolean;
  align?: "start" | "center" | "end";
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
    <EvaluationRulePickerController
      open={resolvedOpen}
      onOpenChange={changeOpen}
    >
      <PopoverTrigger asChild>{trigger(resolvedOpen)}</PopoverTrigger>
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
            {disabledRules.length > 0 ? (
              <CommandGroup heading="Already attached">
                {disabledRules.map(({ rule, reason }) => (
                  <CommandItem
                    key={rule.id}
                    value={`${rule.name} ${rule.id}`}
                    disabled
                    title={reason}
                    className="data-[disabled=true]:!pointer-events-auto data-[disabled=true]:!cursor-not-allowed"
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
    </EvaluationRulePickerController>
  );
}
