import {
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { Command as CommandPrimitive } from "cmdk";
import { X } from "@langfuse/icons";

import { Tag } from "@/src/components/design-system/Tag/Tag";
import { Command, CommandList } from "@/src/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/src/components/ui/popover";
import { ModelPatternSuggestionItem } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/components/ModelPatternSuggestionItem/ModelPatternSuggestionItem";
import { ModelPatternTag } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/components/ModelPatternTag/ModelPatternTag";
import { getGatewayModelPatternSuggestions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/fns/getGatewayModelPatternSuggestions";
import type { GatewayModelPatternSuggestion } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/types/gatewayModelPatternSuggestion";
import { addGatewayModelPatterns } from "@/src/features/ai-gateway/fns/gatewayModelPatterns";
import type { GatewayEnabledModels } from "@/src/features/ai-gateway/types/gatewayEnabledModels";

const NO_ENABLED_MODELS: GatewayEnabledModels = { models: [], connections: [] };

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
 * typed pattern. With the caret at the start, ArrowLeft and Backspace select a
 * chip; then ArrowLeft/ArrowRight move, Backspace/Delete remove, and Enter
 * moves the chip back into the input for editing, like clicking it.
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
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const suggestions = getGatewayModelPatternSuggestions(
    query,
    enabledModels,
    patterns,
  );

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
    setActiveIndex(null);
    if (!value.includes(",")) {
      setQuery(value);
      return;
    }
    onPatternsChange(addGatewayModelPatterns(patterns, value));
    setQuery("");
  };

  const handleEdit = (pattern: string) => {
    const remaining = patterns.filter((item) => item !== pattern);
    onPatternsChange(
      query.trim() ? addGatewayModelPatterns(remaining, query) : remaining,
    );
    setQuery(pattern);
    setActiveIndex(null);
    setOpen(true);
    anchorRef.current?.querySelector("input")?.focus();
  };

  const removeActivePattern = (index: number, nextIndex: number) => {
    const remaining = patterns.filter((_, itemIndex) => itemIndex !== index);
    onPatternsChange(remaining);
    setActiveIndex(
      nextIndex >= 0 && nextIndex < remaining.length ? nextIndex : null,
    );
  };

  const handleActivePatternKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowLeft":
        setActiveIndex(Math.max(0, index - 1));
        break;
      case "ArrowRight":
        setActiveIndex(index + 1 < patterns.length ? index + 1 : null);
        break;
      case "Backspace":
        removeActivePattern(index, Math.max(0, index - 1));
        break;
      case "Delete":
        removeActivePattern(index, index);
        break;
      case "Enter":
        handleEdit(patterns[index] ?? "");
        break;
      case "Escape":
        setActiveIndex(null);
        break;
      default:
        setActiveIndex(null);
        return;
    }
    event.preventDefault();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (activeIndex !== null) {
      handleActivePatternKeyDown(event, activeIndex);
      return;
    }
    const { selectionStart, selectionEnd } = event.currentTarget;
    const isCaretAtStart = selectionStart === 0 && selectionEnd === 0;
    if (
      patterns.length > 0 &&
      ((event.key === "Backspace" && isCaretAtStart) ||
        (event.key === "ArrowLeft" && isCaretAtStart))
    ) {
      event.preventDefault();
      setActiveIndex(patterns.length - 1);
    }
  };

  const handleFocus = () => setOpen(true);

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget?.closest("[data-model-patterns-input]")) return;
    if (query.trim())
      onPatternsChange(addGatewayModelPatterns(patterns, query));
    setQuery("");
    setOpen(false);
    setActiveIndex(null);
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
    <Command
      label={label}
      shouldFilter={false}
      loop
      className="h-auto overflow-visible rounded-none bg-transparent"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            data-model-patterns-input
            className="ph-no-capture bg-background ring-offset-background border-input focus-within:ring-ring flex min-h-8 w-full items-center gap-1 rounded-md border py-1 pr-1 pl-1.5 text-sm focus-within:ring-2 focus-within:ring-offset-2"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {patterns.length === 0 ? (
                <Tag
                  text="All enabled models"
                  remove={{ onRemove: handleClear }}
                />
              ) : (
                patterns.map((pattern, index) => (
                  <ModelPatternTag
                    key={pattern}
                    pattern={pattern}
                    isActive={index === activeIndex}
                    onEdit={handleEdit}
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
        </PopoverAnchor>
        <PopoverContent
          align="start"
          onOpenAutoFocus={keepInputFocused}
          onCloseAutoFocus={keepInputFocused}
          onMouseDown={keepInputFocused}
          onInteractOutside={keepOpenOnInputInteraction}
          className="w-(--radix-popover-trigger-width) min-w-0 overflow-hidden p-0"
        >
          <CommandList className="ph-no-capture max-h-96 p-1.5">
            {suggestions.map((suggestion) => (
              <ModelPatternSuggestionItem
                key={`${suggestion.kind}:${suggestion.pattern}`}
                suggestion={suggestion}
                checked={isChecked(suggestion)}
                onSelect={handleSelect}
              />
            ))}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
