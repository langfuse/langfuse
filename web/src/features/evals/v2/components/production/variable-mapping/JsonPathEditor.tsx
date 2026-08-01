import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";

/** A focused JSONPath editor with optional paths suggested from sample data. */
export function JsonPathEditor({
  initialPath,
  suggestions,
  onApply,
  onCancel,
}: {
  initialPath: string;
  suggestions: string[];
  onApply: (jsonSelector: string | null) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState(initialPath);
  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (!trimmed || trimmed === "$") return suggestions;
    const lower = trimmed.toLowerCase();
    return suggestions.filter((path) => path.toLowerCase().includes(lower));
  }, [suggestions, trimmed]);

  const apply = (path: string) => {
    const normalized = path.trim();
    onApply(normalized && normalized !== "$" ? normalized : null);
  };

  return (
    <Command shouldFilter={false} className="bg-transparent">
      <div className="flex items-center gap-1 border-b pr-1">
        <div className="min-w-0 flex-1">
          <CommandInput
            autoFocus
            showBorder={false}
            className="font-mono text-sm"
            placeholder="$.messages[*].content"
            value={query}
            onValueChange={setQuery}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancel();
            }}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Apply JSONPath"
          onClick={() => apply(query)}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Cancel"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <CommandList>
        <CommandItem value="__full__" onSelect={() => apply("$")}>
          Full value (no path)
        </CommandItem>
        {trimmed.length > 0 &&
          trimmed !== "$" &&
          !suggestions.includes(trimmed) && (
            <CommandItem
              value={trimmed}
              className="font-mono text-xs"
              onSelect={() => apply(trimmed)}
            >{`Use "${trimmed}"`}</CommandItem>
          )}
        {filtered.length > 0 && (
          <CommandGroup heading="From sample observation">
            {filtered.slice(0, 50).map((path) => (
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
  );
}
