import { useState, useEffect } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
} from "@/src/components/ui/input-command";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import { Plus, X, Check, ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { KeyValueFilterEntry } from "@/src/features/filters/hooks/use-filter-state-new";

interface KeyValueFilterBuilderProps {
  keyOptions?: string[];
  availableValues: Record<string, string[]>;
  activeFilters: KeyValueFilterEntry[];
  onChange: (filters: KeyValueFilterEntry[]) => void;
}

export function KeyValueFilterBuilder({
  keyOptions,
  availableValues,
  activeFilters,
  onChange,
}: KeyValueFilterBuilderProps) {
  // Local UI state for filter rows (includes incomplete filters)
  const [localFilters, setLocalFilters] = useState<KeyValueFilterEntry[]>([]);

  // Track which popover is open (by index)
  const [openPopoverIndex, setOpenPopoverIndex] = useState<number | null>(null);

  // Initialize from activeFilters (which only has complete filters)
  useEffect(() => {
    setLocalFilters(activeFilters.length > 0 ? activeFilters : []);
  }, [activeFilters]);

  const handleFilterChange = (
    index: number,
    updates: Partial<KeyValueFilterEntry>,
  ) => {
    const newFilters = [...localFilters];
    newFilters[index] = { ...newFilters[index], ...updates };
    setLocalFilters(newFilters);
    // Immediately notify parent (parent will filter out incomplete ones)
    onChange(newFilters);
  };

  const handleAddFilter = () => {
    const newFilters = [
      ...localFilters,
      { key: "", operator: "any of" as const, value: [] },
    ];
    setLocalFilters(newFilters);
  };

  const handleRemoveFilter = (index: number) => {
    const newFilters = localFilters.filter((_, i) => i !== index);
    setLocalFilters(newFilters);
    onChange(newFilters);
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-2">
      {/* Filter rows */}
      {localFilters.map((filter, index) => {
        const availableValuesForKey = filter.key
          ? (availableValues[filter.key] ?? [])
          : [];

        return (
          <div
            key={index}
            className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0"
          >
            {/* Key input and delete button row */}
            <div className="flex items-center gap-2">
              {keyOptions ? (
                // Combobox for known keys
                <Popover
                  open={openPopoverIndex === index}
                  onOpenChange={(open) =>
                    setOpenPopoverIndex(open ? index : null)
                  }
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="flex-1 justify-between text-left font-normal"
                    >
                      <span
                        className={cn(!filter.key && "text-muted-foreground")}
                      >
                        {filter.key || "Select key..."}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <InputCommand>
                      <InputCommandInput placeholder="Search keys..." />
                      <InputCommandList>
                        <InputCommandEmpty>No keys found.</InputCommandEmpty>
                        <InputCommandGroup>
                          {keyOptions.map((option) => (
                            <InputCommandItem
                              key={option}
                              value={option}
                              onSelect={(value) => {
                                handleFilterChange(index, {
                                  key: value,
                                  value: [],
                                });
                                setOpenPopoverIndex(null); // Close after selection
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  option === filter.key
                                    ? "visible"
                                    : "invisible",
                                )}
                              />
                              {option}
                            </InputCommandItem>
                          ))}
                        </InputCommandGroup>
                      </InputCommandList>
                    </InputCommand>
                  </PopoverContent>
                </Popover>
              ) : (
                // Text input for free-form keys
                <Input
                  placeholder="Enter key..."
                  value={filter.key}
                  onChange={(e) =>
                    handleFilterChange(index, {
                      key: e.target.value,
                      value: [],
                    })
                  }
                  className="flex-1"
                />
              )}

              {/* Delete button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveFilter(index)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Operator select */}
            <Select
              value={filter.operator}
              onValueChange={(value) =>
                handleFilterChange(index, {
                  operator: value as "any of" | "none of",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any of">any of</SelectItem>
                <SelectItem value="none of">none of</SelectItem>
              </SelectContent>
            </Select>

            {/* Values multi-select */}
            <MultiSelect
              title="Values"
              options={availableValuesForKey.map((v) => ({ value: v }))}
              values={filter.value}
              onValueChange={(values) =>
                handleFilterChange(index, { value: values })
              }
              disabled={!filter.key}
            />
          </div>
        );
      })}

      {/* Add filter button */}
      <Button
        onClick={handleAddFilter}
        size="sm"
        variant="outline"
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add filter
      </Button>
    </div>
  );
}
