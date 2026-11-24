"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";
import { Command as CommandPrimitive } from "cmdk";
import { LoaderCircle, X, type IconComponent } from "@langfuse/icons";

import { AsyncAutocompleteChip } from "@/src/components/AsyncAutocompleteInput/components/AsyncAutocompleteChip/AsyncAutocompleteChip";
import { AsyncAutocompleteOptionItem } from "@/src/components/AsyncAutocompleteInput/components/AsyncAutocompleteOptionItem/AsyncAutocompleteOptionItem";
import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/types/asyncAutocompleteOption";
import { Tag } from "@/src/components/design-system/Tag/Tag";
import { Command, CommandList } from "@/src/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/src/components/ui/popover";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";
import { cn } from "@/src/utils/tailwind";

export type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/types/asyncAutocompleteOption";

export type AsyncAutocompleteInputProps<V extends string = string> = {
  /** The selected options, kept with their labels while the list shows others. */
  value: AsyncAutocompleteOption<V>[];
  options: AsyncAutocompleteOption<V>[];
  onValueChange: (newValue: AsyncAutocompleteOption<V>[]) => void;
  /**
   * Optional custom selection handler when toggling an option has special
   * semantics (e.g. mutually exclusive options or sentinel rows). Defaults to
   * toggling the option in `value`.
   */
  onOptionSelect?: (option: AsyncAutocompleteOption<V>) => void;
  placeholder: string;
  /** Caller-owned search query; options are rendered without filtering. */
  search: {
    value: string;
    onValueChange: (value: string) => void;
  };
  emptyMessage: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  loading?: { message: string };
  /** Fallback chip rendered when `value` is empty (e.g. "All enabled models"). */
  emptyTag?: {
    label: string;
    icon?: IconComponent;
    onRemove?: () => void;
  };
  /** Enables clicking or pressing Enter on a chip to edit it inline. */
  onEditItem?: (item: AsyncAutocompleteOption<V>) => void;
  clearLabel?: string;
  onBlur?: (query: string) => void;
  inputRef?: Ref<HTMLInputElement>;
};

/**
 * Search and selection are caller-owned; options are rendered without filtering.
 * Mirrors `AsyncMultiSelectTagInput` with an inline text input for autocomplete.
 */
export function AsyncAutocompleteInput<V extends string = string>({
  value: selected,
  options,
  onValueChange,
  onOptionSelect,
  placeholder,
  search,
  emptyMessage,
  disabled = false,
  error = false,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  loading,
  emptyTag,
  onEditItem,
  clearLabel = "Clear selection",
  onBlur,
  inputRef,
}: AsyncAutocompleteInputProps<V>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedValues = useMemo(
    () => new Set(selected.map((item) => item.value)),
    [selected],
  );

  const focusInput = () => {
    anchorRef.current?.querySelector("input")?.focus();
  };

  const handleSelectOption = (option: AsyncAutocompleteOption<V>) => {
    if (disabled || option.disabled) return;
    if (onOptionSelect) {
      onOptionSelect(option);
      return;
    }
    search.onValueChange("");
    if (selectedValues.has(option.value)) {
      onValueChange(selected.filter((item) => item.value !== option.value));
      return;
    }
    onValueChange([...selected, option]);
  };

  const handleQueryChange = (nextValue: string) => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(null);
    search.onValueChange(nextValue);
  };

  const handleEdit = (item: AsyncAutocompleteOption<V>) => {
    if (disabled || item.disabled || !onEditItem) return;
    onEditItem(item);
    setActiveIndex(null);
    setOpen(true);
    focusInput();
  };

  const handleRemove = (removedValue: V) => {
    if (disabled) return;
    onValueChange(
      selected.filter(
        (item) => item.value !== removedValue || Boolean(item.disabled),
      ),
    );
  };

  const removeActiveItem = (index: number, nextIndex: number) => {
    const target = selected[index];
    if (!target || target.disabled) return;
    const remaining = selected.filter((_, itemIndex) => itemIndex !== index);
    onValueChange(remaining);
    setActiveIndex(
      nextIndex >= 0 && nextIndex < remaining.length ? nextIndex : null,
    );
  };

  const handleActiveChipKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowLeft":
        setActiveIndex(Math.max(0, index - 1));
        break;
      case "ArrowRight":
        setActiveIndex(index + 1 < selected.length ? index + 1 : null);
        break;
      case "Backspace":
        removeActiveItem(index, Math.max(0, index - 1));
        break;
      case "Delete":
        removeActiveItem(index, index);
        break;
      case "Enter": {
        const activeItem = selected[index];
        if (activeItem && onEditItem) {
          handleEdit(activeItem);
          break;
        }
        return;
      }
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
    if (disabled) return;
    if (activeIndex !== null) {
      handleActiveChipKeyDown(event, activeIndex);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    const { selectionStart, selectionEnd } = event.currentTarget;
    const isCaretAtStart = selectionStart === 0 && selectionEnd === 0;
    if (
      selected.length > 0 &&
      isCaretAtStart &&
      (event.key === "Backspace" || event.key === "ArrowLeft")
    ) {
      event.preventDefault();
      if (onEditItem) {
        setActiveIndex(selected.length - 1);
      } else if (event.key === "Backspace") {
        let lastRemovableIndex = -1;
        for (let i = selected.length - 1; i >= 0; i -= 1) {
          if (!selected[i]?.disabled) {
            lastRemovableIndex = i;
            break;
          }
        }
        if (lastRemovableIndex >= 0) removeActiveItem(lastRemovableIndex, -1);
      } else {
        setActiveIndex(selected.length - 1);
      }
    }
  };

  const handleFocus = () => {
    if (!disabled) setOpen(true);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget?.closest("[data-async-autocomplete-input]")) return;
    const currentQuery = search.value;
    setOpen(false);
    setActiveIndex(null);
    onBlur?.(currentQuery);
  };

  const handleClear = () => {
    if (disabled) return;
    onValueChange(selected.filter((item) => Boolean(item.disabled)));
    search.onValueChange("");
  };

  const handleContainerMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }
    setOpen(true);
    focusInput();
  };

  const handleKeepInputFocused = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  const handleInteractOutside = (event: {
    target: EventTarget | null;
    preventDefault: () => void;
  }) => {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-async-autocomplete-input]")
    ) {
      event.preventDefault();
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    setOpen(nextOpen);
  };

  const allSelectedDisabled =
    selected.length > 0 && selected.every((item) => Boolean(item.disabled));
  const showClearButton =
    !disabled && (selected.length > 0 || emptyTag !== undefined);
  const showEmpty = !loading && options.length === 0;

  return (
    <Command
      label={ariaLabel}
      shouldFilter={false}
      loop
      className="h-auto overflow-visible rounded-none bg-transparent"
    >
      <Popover open={!disabled && open} onOpenChange={handleOpenChange}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            data-async-autocomplete-input
            onMouseDown={handleContainerMouseDown}
            className={cn(
              "ph-no-capture bg-background ring-offset-background border-input focus-within:ring-ring flex min-h-8 w-full items-center gap-1 rounded-md border py-1 pr-1 pl-1.5 text-sm focus-within:ring-2 focus-within:ring-offset-2",
              error &&
                "border-destructive focus-within:ring-destructive/40 focus-within:ring-offset-0",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {selected.length === 0 && emptyTag ? (
                <Tag
                  text={emptyTag.label}
                  icon={emptyTag.icon}
                  remove={
                    emptyTag.onRemove
                      ? { onRemove: emptyTag.onRemove, disabled }
                      : undefined
                  }
                />
              ) : (
                selected.map((item, index) => (
                  <AsyncAutocompleteChip
                    key={item.value}
                    item={item}
                    isActive={index === activeIndex}
                    disabled={disabled}
                    onEdit={onEditItem ? handleEdit : undefined}
                    onRemove={handleRemove}
                  />
                ))
              )}
              <CommandPrimitive.Input
                ref={inputRef}
                id={id}
                name={name}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-controls={listId}
                aria-expanded={!disabled && open}
                aria-describedby={ariaDescribedBy}
                aria-invalid={ariaInvalid ?? (error || undefined)}
                className="placeholder:text-muted-foreground h-6 min-w-28 flex-1 border-0 bg-transparent p-0 px-1 text-sm shadow-none outline-hidden focus:ring-0 disabled:cursor-not-allowed"
                placeholder={placeholder}
                value={search.value}
                onValueChange={handleQueryChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
            {showClearButton ? (
              <button
                type="button"
                disabled={allSelectedDisabled}
                data-clear-selection
                aria-label={clearLabel}
                tabIndex={-1}
                className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center self-start rounded-sm disabled:cursor-not-allowed disabled:opacity-50"
                onMouseDown={handleKeepInputFocused}
                onClick={handleClear}
              >
                <X size="base" aria-hidden />
              </button>
            ) : null}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          onOpenAutoFocus={handleKeepInputFocused}
          onCloseAutoFocus={handleKeepInputFocused}
          onMouseDown={handleKeepInputFocused}
          onInteractOutside={handleInteractOutside}
          onWheel={stopScrollPropagation()}
          onTouchMove={stopScrollPropagation()}
          className="w-(--radix-popover-trigger-width) min-w-0 overflow-hidden p-0"
        >
          <CommandList
            id={listId}
            aria-busy={Boolean(loading)}
            className="ph-no-capture max-h-96 p-1.5"
          >
            {options.map((option) => (
              <AsyncAutocompleteOptionItem
                key={option.value}
                option={option}
                checked={option.checked ?? selectedValues.has(option.value)}
                onSelect={handleSelectOption}
              />
            ))}
            {loading ? (
              <div
                role="status"
                className="text-muted-foreground flex items-center gap-2 px-2 py-2 text-sm"
              >
                <LoaderCircle
                  size="base"
                  aria-hidden
                  __rawClassName="animate-spin"
                />
                <span>{loading.message}</span>
              </div>
            ) : null}
            {showEmpty ? (
              <div className="text-muted-foreground py-4 text-center text-sm">
                {emptyMessage}
              </div>
            ) : null}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
