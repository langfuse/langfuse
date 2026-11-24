import { useMemo, useState, type Ref } from "react";
import { Box, Hash, LayoutGrid, type IconComponent } from "@langfuse/icons";

import {
  AsyncAutocompleteInput,
  type AsyncAutocompleteOption,
} from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import { getGatewayModelPatternSuggestions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/fns/getGatewayModelPatternSuggestions";
import type { GatewayModelPatternSuggestion } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/types/gatewayModelPatternSuggestion";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import {
  addGatewayModelPatterns,
  describeGatewayModelPattern,
  isGatewayModelExcludePattern,
} from "@/src/features/ai-gateway/fns/gatewayModelPatterns";
import type { GatewayEnabledModels } from "@/src/features/ai-gateway/types/gatewayEnabledModels";

const NO_ENABLED_MODELS: GatewayEnabledModels = { models: [], connections: [] };
const ALL_MODELS_VALUE = "__all_enabled_models__";
const ALL_MODELS_LABEL = "All enabled models";

type ModelPatternsInputProps = {
  /** cmdk owns the input id, so the accessible name comes from its own label. */
  label: string;
  describedById: string | undefined;
  name: string;
  patterns: string[];
  /** Undefined offers only "All enabled models" and the typed pattern. */
  enabledModels: GatewayEnabledModels | undefined;
  onPatternsChange: (patterns: string[]) => void;
  onBlur: () => void;
  inputRef: Ref<HTMLInputElement>;
};

/**
 * Pattern chips with an inline input that suggests connections, models and the
 * typed pattern. Clicking a chip or pressing Enter on a selected chip moves it
 * back into the input for editing.
 */
export function ModelPatternsInput({
  label,
  describedById,
  name,
  patterns,
  enabledModels = NO_ENABLED_MODELS,
  onPatternsChange,
  onBlur,
  inputRef,
}: ModelPatternsInputProps) {
  const [query, setQuery] = useState("");

  const selectedItems = useMemo<AsyncAutocompleteOption[]>(
    () =>
      patterns.map((pattern) => {
        const isExclude = isGatewayModelExcludePattern(pattern);
        return {
          value: pattern,
          label: isExclude ? pattern.slice(1) : pattern,
          title: describeGatewayModelPattern(pattern),
          strikethrough: isExclude,
        };
      }),
    [patterns],
  );

  const options = useMemo<AsyncAutocompleteOption[]>(() => {
    const suggestions = getGatewayModelPatternSuggestions(
      query,
      enabledModels,
      patterns,
    );
    return suggestions.map((suggestion) => ({
      value: suggestion.pattern ?? ALL_MODELS_VALUE,
      label: suggestion.pattern ?? ALL_MODELS_LABEL,
      icon: toSuggestionIcon(suggestion),
      mono: suggestion.pattern !== null,
      checked:
        suggestion.pattern === null
          ? patterns.length === 0
          : patterns.includes(suggestion.pattern),
    }));
  }, [query, enabledModels, patterns]);

  const handleOptionSelect = (option: AsyncAutocompleteOption) => {
    setQuery("");
    if (option.value === ALL_MODELS_VALUE) {
      onPatternsChange([]);
      return;
    }
    const pattern = option.value;
    onPatternsChange(
      patterns.includes(pattern)
        ? patterns.filter((item) => item !== pattern)
        : [...patterns, pattern],
    );
  };

  const handleValueChange = (nextItems: AsyncAutocompleteOption[]) => {
    onPatternsChange(nextItems.map((item) => item.value));
  };

  const handleQueryChange = (value: string) => {
    if (!value.includes(",")) {
      setQuery(value);
      return;
    }
    onPatternsChange(addGatewayModelPatterns(patterns, value));
    setQuery("");
  };

  const handleEditItem = (item: AsyncAutocompleteOption) => {
    const remaining = patterns.filter((candidate) => candidate !== item.value);
    onPatternsChange(
      query.trim() ? addGatewayModelPatterns(remaining, query) : remaining,
    );
    setQuery(item.value);
  };

  const handleBlur = (currentQuery: string) => {
    if (currentQuery.trim()) {
      onPatternsChange(addGatewayModelPatterns(patterns, currentQuery));
    }
    setQuery("");
    onBlur();
  };

  const handleClear = () => {
    onPatternsChange([]);
    setQuery("");
  };

  return (
    <AsyncAutocompleteInput
      aria-label={label}
      aria-describedby={describedById}
      name={name}
      value={selectedItems}
      options={options}
      onValueChange={handleValueChange}
      onOptionSelect={handleOptionSelect}
      search={{ value: query, onValueChange: handleQueryChange }}
      placeholder="Add models, connections or patterns"
      emptyMessage="No matching models."
      emptyTag={{ label: ALL_MODELS_LABEL, onRemove: handleClear }}
      onEditItem={handleEditItem}
      clearLabel="Clear models"
      onBlur={handleBlur}
      inputRef={inputRef}
    />
  );
}

function toSuggestionIcon(
  suggestion: GatewayModelPatternSuggestion,
): IconComponent {
  if (suggestion.kind === "model") return providerIcons[suggestion.provider];
  if (suggestion.kind === "connection") return Box;
  if (suggestion.kind === "typed-pattern") return Hash;
  return LayoutGrid;
}
