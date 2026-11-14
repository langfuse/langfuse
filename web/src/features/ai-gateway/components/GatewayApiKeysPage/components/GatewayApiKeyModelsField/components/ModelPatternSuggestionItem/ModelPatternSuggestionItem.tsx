import { createElement } from "react";
import {
  Box,
  Check,
  Hash,
  LayoutGrid,
  type IconComponent,
} from "@langfuse/icons";

import type { GatewayModelPatternSuggestion } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/types/gatewayModelPatternSuggestion";
import { CommandItem } from "@/src/components/ui/command";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import { cn } from "@/src/utils/tailwind";

const ALL_MODELS_LABEL = "All enabled models";

type ModelPatternSuggestionItemProps = {
  suggestion: GatewayModelPatternSuggestion;
  checked: boolean;
  onSelect: (suggestion: GatewayModelPatternSuggestion) => void;
};

const toIcon = (suggestion: GatewayModelPatternSuggestion): IconComponent => {
  if (suggestion.kind === "model") return providerIcons[suggestion.provider];
  if (suggestion.kind === "connection") return Box;
  if (suggestion.kind === "typed-pattern") return Hash;
  return LayoutGrid;
};

export function ModelPatternSuggestionItem({
  suggestion,
  checked,
  onSelect,
}: ModelPatternSuggestionItemProps) {
  const label = suggestion.pattern ?? ALL_MODELS_LABEL;
  const handleSelect = () => onSelect(suggestion);

  return (
    <CommandItem
      value={`${suggestion.kind}:${label}`}
      aria-checked={checked}
      onSelect={handleSelect}
      className="ph-no-capture w-full"
    >
      <span className="text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-sm border">
        {createElement(toIcon(suggestion), { size: "sm", "aria-hidden": true })}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          suggestion.pattern !== null && "font-mono text-xs",
        )}
        title={label}
      >
        {label}
      </span>
      <span className="flex w-3.5 shrink-0 items-center justify-center">
        {checked ? <Check size="base" aria-hidden /> : null}
      </span>
    </CommandItem>
  );
}
