import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Button } from "@/src/components/ui/button";
import { X } from "lucide-react";

export interface ScoreOption {
  value: string; // Format: "name-type-source"
  name: string;
  dataType: string;
  source: string;
}

interface ScoreSelectorProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  options: ScoreOption[];
  placeholder?: string;
  filterByDataType?: string | string[]; // Single type or array of compatible types
  className?: string;
}

export function ScoreSelector({
  value,
  onChange,
  options,
  placeholder = "Select a score",
  filterByDataType,
  className,
}: ScoreSelectorProps) {
  const filteredOptions = filterByDataType
    ? options.filter((opt) => {
        if (Array.isArray(filterByDataType)) {
          return filterByDataType.includes(opt.dataType);
        }
        return opt.dataType === filterByDataType;
      })
    : options;

  const handleClear = () => {
    onChange(undefined);
  };

  // Group options by dataType
  const groupedOptions = filteredOptions.reduce(
    (acc, option) => {
      const type = option.dataType;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(option);
      return acc;
    },
    {} as Record<string, ScoreOption[]>,
  );

  // Define display labels for data types
  const typeLabels: Record<string, string> = {
    BOOLEAN: "Boolean",
    CATEGORICAL: "Categorical",
    NUMERIC: "Numeric",
  };

  // Define order for data types (matches sorting in analytics.tsx)
  const typeOrder = ["BOOLEAN", "CATEGORICAL", "NUMERIC"];

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} className="p-0" />
        </SelectTrigger>
        <SelectContent>
          {filteredOptions.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground">
              No scores available
            </div>
          ) : (
            typeOrder.map((type) => {
              const group = groupedOptions[type];
              if (!group || group.length === 0) return null;

              return (
                <SelectGroup key={type}>
                  <SelectLabel className="pl-2">
                    {typeLabels[type] ?? type}
                  </SelectLabel>
                  {group.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="pl-6"
                    >
                      <span>
                        {option.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          • {option.source}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })
          )}
        </SelectContent>
      </Select>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          title="Clear selection"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
