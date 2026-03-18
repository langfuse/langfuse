import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { MultiSelectCombobox } from "@/src/components/ui/multi-select-combobox";
import { Badge } from "@/src/components/ui/badge";

export type ExperimentOption = {
  id: string;
  name: string;
};

type ExperimentComparisonSelectorProps = {
  baselineExperimentId: string;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  // Search state - managed externally for query flexibility
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  // Experiments from query (you provide this)
  experiments: ExperimentOption[];
  isLoading?: boolean;
  maxSelections?: number;
  disabled?: boolean;
};

export function ExperimentComparisonSelector({
  baselineExperimentId,
  selectedIds,
  onSelectedIdsChange,
  searchQuery,
  onSearchQueryChange,
  experiments,
  isLoading = false,
  maxSelections = 4,
  disabled = false,
}: ExperimentComparisonSelectorProps) {
  // Filter out baseline experiment from options
  const searchResults = useMemo(() => {
    return experiments.filter((exp) => exp.id !== baselineExperimentId);
  }, [experiments, baselineExperimentId]);

  // Map selected IDs to full experiment objects
  const selectedExperiments = useMemo(() => {
    return selectedIds
      .map((id) => {
        const found = experiments.find((exp) => exp.id === id);
        if (found) return found;
        // If not in current results, create placeholder with ID as name
        return { id, name: id };
      })
      .filter((exp): exp is ExperimentOption => exp !== undefined);
  }, [selectedIds, experiments]);

  const handleItemsChange = (items: ExperimentOption[]) => {
    const newIds = items.map((item) => item.id).slice(0, maxSelections);
    onSelectedIdsChange(newIds);
  };

  const isMaxReached = selectedIds.length >= maxSelections;

  return (
    <div className="space-y-2">
      <MultiSelectCombobox<ExperimentOption>
        selectedItems={selectedExperiments}
        onItemsChange={handleItemsChange}
        searchQuery={searchQuery}
        onSearchChange={onSearchQueryChange}
        searchResults={searchResults}
        isLoading={isLoading}
        placeholder={
          isMaxReached
            ? `Max ${maxSelections} comparisons`
            : "Search experiments..."
        }
        disabled={disabled || isMaxReached}
        getItemKey={(item) => item.id}
        renderItem={(item, isSelected, onToggle) => (
          <button
            type="button"
            onClick={onToggle}
            disabled={!isSelected && isMaxReached}
            className="hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex h-4 w-4 items-center justify-center">
              {isSelected && <Check className="text-primary h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
            </div>
          </button>
        )}
        renderSelectedItem={(item, onRemove) => (
          <Badge
            variant="secondary"
            className="flex items-center gap-1 px-2 py-0.5"
          >
            <span className="max-w-24 truncate text-xs">{item.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="hover:bg-muted ml-0.5 rounded-full"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
      />
      {selectedIds.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {selectedIds.length} of {maxSelections} comparisons selected
        </p>
      )}
    </div>
  );
}
