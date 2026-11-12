import { createElement } from "react";
import { Command as CommandPrimitive } from "cmdk";
import {
  Box,
  Check,
  Hash,
  LayoutGrid,
  type IconComponent,
} from "@langfuse/icons";

import type { GatewayModelPatternSuggestion } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/types/gatewayModelPatternSuggestion";
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
    <CommandPrimitive.Item
      value={`${suggestion.kind}:${label}`}
      aria-checked={checked}
      onSelect={handleSelect}
      className="aria-selected:bg-accent aria-selected:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1.5 text-sm outline-hidden select-none"
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
    </CommandPrimitive.Item>
  );
}
