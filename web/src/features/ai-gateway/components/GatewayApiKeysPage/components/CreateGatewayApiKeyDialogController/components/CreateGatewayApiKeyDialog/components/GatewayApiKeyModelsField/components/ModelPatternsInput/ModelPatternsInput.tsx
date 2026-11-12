import { useState, type FocusEvent, type KeyboardEvent, type Ref } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { X } from "@langfuse/icons";

import { Tag } from "@/src/components/design-system/Tag/Tag";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";
import { ModelPatternSuggestionItem } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/components/ModelPatternSuggestionItem/ModelPatternSuggestionItem";
import { ModelPatternTag } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/components/ModelPatternTag/ModelPatternTag";
import { getGatewayModelPatternSuggestions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/fns/getGatewayModelPatternSuggestions";
import type { GatewayModelPatternSuggestion } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/types/gatewayModelPatternSuggestion";
import { addGatewayModelPatterns } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/fns/addGatewayModelPatterns";
import type { GatewayEnabledModel } from "@/src/features/ai-gateway/types/gatewayEnabledModel";

const NO_ENABLED_MODELS: GatewayEnabledModel[] = [];

type ModelPatternsInputProps = {
  /** cmdk owns the input id, so the accessible name comes from its own label. */
  label: string;
  describedById: string | undefined;
  name: string;
  patterns: string[];
  /** Undefined offers only "All enabled models" and the typed pattern. */
  enabledModels: GatewayEnabledModel[] | undefined;
  onPatternsChange: (patterns: string[]) => void;
  onBlur: () => void;
  inputRef: Ref<HTMLInputElement>;
};

/** Pattern chips with an inline input that suggests connections, models and the typed pattern. */
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
  const container = useLayerContainer("popover");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const suggestions = getGatewayModelPatternSuggestions(query, enabledModels);

  const isChecked = (suggestion: GatewayModelPatternSuggestion) =>
    suggestion.pattern === null
      ? patterns.length === 0
      : patterns.includes(suggestion.pattern);

  const handleSelect = (suggestion: GatewayModelPatternSuggestion) => {
    setQuery("");
    if (suggestion.pattern === null) {
      onPatternsChange([]);
      return;
    }
    const { pattern } = suggestion;
    onPatternsChange(
      patterns.includes(pattern)
        ? patterns.filter((item) => item !== pattern)
        : [...patterns, pattern],
    );
  };

  const handleQueryChange = (value: string) => {
    setOpen(true);
    if (!value.includes(",")) {
      setQuery(value);
      return;
    }
    onPatternsChange(addGatewayModelPatterns(patterns, value));
    setQuery("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && query === "" && patterns.length > 0) {
      event.preventDefault();
      onPatternsChange(patterns.slice(0, -1));
    }
  };

  const handleFocus = () => setOpen(true);

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget?.closest("[data-model-patterns-input]")) return;
    if (query.trim())
      onPatternsChange(addGatewayModelPatterns(patterns, query));
    setQuery("");
    setOpen(false);
    onBlur();
  };

  const handleRemove = (pattern: string) =>
    onPatternsChange(patterns.filter((item) => item !== pattern));

  const handleClear = () => {
    onPatternsChange([]);
    setQuery("");
  };

  const keepInputFocused = (event: { preventDefault: () => void }) =>
    event.preventDefault();

  const keepOpenOnInputInteraction = (event: {
    target: EventTarget | null;
    preventDefault: () => void;
  }) => {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-model-patterns-input]")
    ) {
      event.preventDefault();
    }
  };

  return (
    <CommandPrimitive label={label} shouldFilter={false} loop>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Anchor asChild>
          <div
            data-model-patterns-input
            className="bg-background ring-offset-background border-input focus-within:ring-ring flex min-h-8 w-full items-center gap-1 rounded-md border py-1 pr-1 pl-1.5 text-sm focus-within:ring-2 focus-within:ring-offset-2"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {patterns.length === 0 ? (
                <Tag
                  text="All enabled models"
                  remove={{ onRemove: handleClear }}
                />
              ) : (
                patterns.map((pattern) => (
                  <ModelPatternTag
                    key={pattern}
                    pattern={pattern}
                    onRemove={handleRemove}
                  />
                ))
              )}
              <CommandPrimitive.Input
                ref={inputRef}
                name={name}
                aria-describedby={describedById}
                className="placeholder:text-muted-foreground h-6 min-w-40 flex-1 border-0 bg-transparent p-0 px-1 text-sm shadow-none outline-hidden focus:ring-0"
                placeholder="Add models, connections or patterns"
                value={query}
                onValueChange={handleQueryChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
            <button
              type="button"
              aria-label="Clear models"
              tabIndex={-1}
              className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-sm"
              onMouseDown={keepInputFocused}
              onClick={handleClear}
            >
              <X size="base" aria-hidden />
            </button>
          </div>
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal container={container}>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            onOpenAutoFocus={keepInputFocused}
            onCloseAutoFocus={keepInputFocused}
            onMouseDown={keepInputFocused}
            onInteractOutside={keepOpenOnInputInteraction}
            onWheel={stopScrollPropagation()}
            onTouchMove={stopScrollPropagation()}
            className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 w-(--radix-popover-trigger-width) overflow-hidden rounded-md border shadow-md outline-hidden"
          >
            <CommandPrimitive.List className="max-h-96 overflow-auto p-1.5">
              {suggestions.map((suggestion) => (
                <ModelPatternSuggestionItem
                  key={`${suggestion.kind}:${suggestion.pattern}`}
                  suggestion={suggestion}
                  checked={isChecked(suggestion)}
                  onSelect={handleSelect}
                />
              ))}
            </CommandPrimitive.List>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </CommandPrimitive>
  );
}
