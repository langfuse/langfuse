import {
  Select,
  SelectContent,
  SelectItem,
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
  filterByDataType?: string; // When set, only show scores matching this data type
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
    ? options.filter((opt) => opt.dataType === filterByDataType)
    : options;

  const handleClear = () => {
    onChange(undefined);
  };

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
            filteredOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col">
                  <span>{option.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.dataType} • {option.source}
                  </span>
                </div>
              </SelectItem>
            ))
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
