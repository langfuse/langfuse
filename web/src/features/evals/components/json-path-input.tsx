import { useMemo, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { cn } from "@/src/utils/tailwind";
import { extractJsonPathSuggestions } from "@/src/features/evals/utils/jsonPathSuggestions";

export function JsonPathInputWithSuggestions(props: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
  sampleValue?: unknown;
  isLoadingSample?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const {
    value,
    onChange,
    disabled,
    sampleValue,
    isLoadingSample,
    placeholder = "Optional",
    className,
  } = props;

  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => {
    if (isLoadingSample) return [] as string[];
    if (sampleValue === undefined || sampleValue === null)
      return [] as string[];
    return extractJsonPathSuggestions(sampleValue, {
      maxDepth: 10,
      maxPaths: 150,
      includeIntermediate: true,
    });
  }, [sampleValue, isLoadingSample]);

  const hasSuggestions = suggestions.length > 0;

  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="min-w-0 flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("shrink-0 whitespace-nowrap")}
          >
            Browse keys
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0">
          <Command>
            <CommandInput placeholder="Search keys..." className="text-xs" />
            <CommandList>
              {isLoadingSample ? (
                <CommandEmpty>Loading sample...</CommandEmpty>
              ) : hasSuggestions ? (
                <CommandGroup heading="Available keys">
                  {suggestions.map((s) => (
                    <CommandItem
                      key={s}
                      value={s}
                      className="text-xs"
                      onSelect={(val) => {
                        onChange(val);
                        setOpen(false);
                      }}
                    >
                      {s}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                <CommandEmpty>No keys available</CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
