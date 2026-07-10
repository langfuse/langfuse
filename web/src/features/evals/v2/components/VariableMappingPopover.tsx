import { useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { getVariableColor } from "@/src/features/evals/components/evaluation-prompt-preview";
import { buildJsonPathSuggestions } from "@/src/features/evals/v2/lib/jsonPathSuggestions";
import { type ScopeTargetObject } from "@/src/features/evals/v2/lib/useSourceObject";
import { cn } from "@/src/utils/tailwind";
import { extractValueFromObjectAsString } from "@langfuse/shared";

const MAPPABLE_COLUMNS = [
  { id: "input", label: "Input" },
  { id: "output", label: "Output" },
  { id: "metadata", label: "Metadata" },
];

const FULL_VALUE_LABEL = "Full value (no path)";

export type VariableFieldState = {
  selectedColumnId: string;
  jsonSelector: string | null;
};

function JsonPathCombobox({
  value,
  suggestions,
  onSelect,
}: {
  value: string | null;
  suggestions: string[];
  onSelect: (jsonSelector: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const filteredSuggestions = useMemo(() => {
    if (!trimmedQuery) return suggestions;
    const lower = trimmedQuery.toLowerCase();
    return suggestions.filter((p) => p.toLowerCase().includes(lower));
  }, [suggestions, trimmedQuery]);

  const apply = (jsonSelector: string | null) => {
    onSelect(jsonSelector);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-between font-mono text-xs font-normal"
        >
          <span className="truncate" title={value ?? FULL_VALUE_LABEL}>
            {value ?? FULL_VALUE_LABEL}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="$.messages[0].content"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandItem value={FULL_VALUE_LABEL} onSelect={() => apply(null)}>
              {FULL_VALUE_LABEL}
            </CommandItem>
            {trimmedQuery.length > 0 && !suggestions.includes(trimmedQuery) && (
              <CommandItem
                value={trimmedQuery}
                className="font-mono text-xs"
                onSelect={() => apply(trimmedQuery)}
              >
                {`Use "${trimmedQuery}"`}
              </CommandItem>
            )}
            {filteredSuggestions.length > 0 && (
              <CommandGroup heading="From sample trace">
                {filteredSuggestions.slice(0, 50).map((path) => (
                  <CommandItem
                    key={path}
                    value={path}
                    className="font-mono text-xs"
                    onSelect={() => apply(path)}
                  >
                    <span className="truncate" title={path}>
                      {path}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Per-variable mapping controls shown when a {{variable}} pill is clicked in
 * the prompt editor. The data source (trace vs observation) is picked once at
 * evaluator level, so only the field + JSONPath remain per variable.
 */
export function VariableMappingContent({
  variable,
  fieldState,
  sourceObject,
  targetObject,
  onChange,
}: {
  variable: string;
  fieldState: VariableFieldState;
  /** The shared evaluator-level source object resolved from the sample trace. */
  sourceObject: Record<string, unknown> | null;
  /** The run-scope target the mapping resolves against. */
  targetObject: ScopeTargetObject;
  onChange: (next: VariableFieldState) => void;
}) {
  const suggestions = useMemo(() => {
    if (!sourceObject) return [];
    return buildJsonPathSuggestions(sourceObject[fieldState.selectedColumnId]);
  }, [sourceObject, fieldState.selectedColumnId]);

  const extractedPreview = useMemo(() => {
    if (!sourceObject) return null;
    const { value, error } = extractValueFromObjectAsString(
      sourceObject,
      fieldState.selectedColumnId,
      fieldState.jsonSelector ?? undefined,
    );
    if (error) return { error: error.message };
    return { value };
  }, [sourceObject, fieldState]);

  const targetLabel =
    targetObject === "trace"
      ? "trace"
      : targetObject === "event"
        ? "observation"
        : "experiment";

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">
        Map{" "}
        <span className={cn("font-mono", getVariableColor(0))}>
          {`{{${variable}}}`}
        </span>{" "}
        to {targetLabel} data
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">Field</Label>
        <Select
          value={fieldState.selectedColumnId}
          onValueChange={(value) =>
            onChange({ ...fieldState, selectedColumnId: value })
          }
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAPPABLE_COLUMNS.map((col) => (
              <SelectItem key={col.id} value={col.id}>
                {col.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">
          JSONPath (optional)
        </Label>
        <JsonPathCombobox
          value={fieldState.jsonSelector}
          suggestions={suggestions}
          onSelect={(jsonSelector) => onChange({ ...fieldState, jsonSelector })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">
          {targetObject === "event"
            ? "First observation of the sample trace (approximation)"
            : "Value from sample"}
        </Label>
        {targetObject === "experiment" ? (
          <p className="text-muted-foreground text-xs">
            Experiment previews aren&apos;t wired in this prototype.
          </p>
        ) : sourceObject ? (
          extractedPreview?.error ? (
            <p className="text-destructive text-xs">{extractedPreview.error}</p>
          ) : (
            <p className="bg-muted/50 line-clamp-4 rounded-md p-2 font-mono text-xs break-all whitespace-pre-wrap">
              {extractedPreview?.value || (
                <span className="text-muted-foreground">empty</span>
              )}
            </p>
          )
        ) : (
          <p className="text-muted-foreground text-xs">
            No sample data — select a trace on the right.
          </p>
        )}
      </div>
    </div>
  );
}
