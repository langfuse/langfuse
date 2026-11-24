"use client";

import {
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

import { Tag } from "@/src/components/design-system/Tag/Tag";
import { TagAutocompleteChip } from "@/src/components/TagAutocompleteInput/components/TagAutocompleteChip/TagAutocompleteChip";
import { TagAutocompleteOptionItem } from "@/src/components/TagAutocompleteInput/components/TagAutocompleteOptionItem/TagAutocompleteOptionItem";
import { rankTagAutocompleteOptions } from "@/src/components/TagAutocompleteInput/fns/rankTagAutocompleteOptions";
import type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/types/tagAutocompleteOption";
import { Command, CommandList } from "@/src/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";

export type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/types/tagAutocompleteOption";

export type TagAutocompleteInputProps<V extends string = string> = {
  /** Accessible label for cmdk. */
  label: string;
  id?: string;
  name?: string;
  describedById?: string;
  value: TagAutocompleteOption<V>[];
  options: TagAutocompleteOption<V>[];
  onValueChange: (nextValue: TagAutocompleteOption<V>[]) => void;
  /**
   * Optional custom selection handler when toggling an option has special
   * semantics (e.g. mutually exclusive options or sentinel rows). Defaults to
   * toggling the option in `value`.
   */
  onOptionSelect?: (option: TagAutocompleteOption<V>) => void;
  /** Controlled search for async or custom-parsed options; omit for local auto-suggest. */
  search?: {
    value: string;
    onValueChange: (value: string) => void;
  };
  loading?: { message: string };
  placeholder?: string;
  emptyMessage?: string;
  /** Fallback chip rendered when `value` is empty (e.g. "All enabled models"). */
  emptyTag?: {
    label: string;
    icon?: IconComponent;
    onRemove?: () => void;
  };
  /** Enables clicking or pressing Enter on a chip to edit it inline. */
  onEditItem?: (item: TagAutocompleteOption<V>) => void;
  clearLabel?: string;
  disabled?: boolean;
  error?: boolean;
  onBlur?: (query: string) => void;
  inputRef?: Ref<HTMLInputElement>;
};

/**
 * Inline multi-select tag input with an auto-suggest popover. Supports static
 * options (filtered locally) or async options (via controlled `search` and
 * `loading`), optional icons on chips and dropdown rows, and keyboard chip
 * navigation from the inline input.
 */
export function TagAutocompleteInput<V extends string = string>({
  label,
  id,
  name,
  describedById,
  value,
  options,
  onValueChange,
  onOptionSelect,
  search,
  loading,
  placeholder = "Search…",
  emptyMessage = "No matches.",
  emptyTag,
  onEditItem,
  clearLabel = "Clear selection",
  disabled = false,
  error = false,
  onBlur,
  inputRef,
}: TagAutocompleteInputProps<V>) {
  const [uncontrolledQuery, setUncontrolledQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const isControlledSearch = search !== undefined;
  const query = isControlledSearch ? search.value : uncontrolledQuery;
  const setQuery = isControlledSearch
    ? search.onValueChange
    : setUncontrolledQuery;

  const displayedOptions = useMemo(
    () =>
      isControlledSearch ? options : rankTagAutocompleteOptions(options, query),
    [isControlledSearch, options, query],
  );

  const selectedValues = useMemo(
    () => new Set(value.map((item) => item.value)),
    [value],
  );

  const focusInput = () => {
    anchorRef.current?.querySelector("input")?.focus();
  };

  const handleSelectOption = (option: TagAutocompleteOption<V>) => {
    if (disabled || option.disabled) return;
    if (onOptionSelect) {
      onOptionSelect(option);
      return;
    }
    setQuery("");
    if (selectedValues.has(option.value)) {
      onValueChange(value.filter((item) => item.value !== option.value));
      return;
    }
    onValueChange([...value, option]);
  };

  const handleQueryChange = (nextValue: string) => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(null);
    setQuery(nextValue);
  };

  const handleEdit = (item: TagAutocompleteOption<V>) => {
    if (disabled || !onEditItem) return;
    onEditItem(item);
    setActiveIndex(null);
    setOpen(true);
    focusInput();
  };

  const handleRemove = (removedValue: V) => {
    if (disabled) return;
    onValueChange(value.filter((item) => item.value !== removedValue));
  };

  const removeActiveItem = (index: number, nextIndex: number) => {
    const remaining = value.filter((_, itemIndex) => itemIndex !== index);
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
        setActiveIndex(index + 1 < value.length ? index + 1 : null);
        break;
      case "Backspace":
        removeActiveItem(index, Math.max(0, index - 1));
        break;
      case "Delete":
        removeActiveItem(index, index);
        break;
      case "Enter": {
        const activeItem = value[index];
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
      value.length > 0 &&
      isCaretAtStart &&
      (event.key === "Backspace" || event.key === "ArrowLeft")
    ) {
      event.preventDefault();
      if (onEditItem) {
        setActiveIndex(value.length - 1);
      } else if (event.key === "Backspace") {
        removeActiveItem(value.length - 1, -1);
      } else {
        setActiveIndex(value.length - 1);
      }
    }
  };

  const handleFocus = () => {
    if (!disabled) setOpen(true);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget?.closest("[data-tag-autocomplete-input]")) return;
    const currentQuery = query;
    setOpen(false);
    setActiveIndex(null);
    if (!isControlledSearch) setUncontrolledQuery("");
    onBlur?.(currentQuery);
  };

  const handleClear = () => {
    if (disabled) return;
    onValueChange([]);
    setQuery("");
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
      event.target.closest("[data-tag-autocomplete-input]")
    ) {
      event.preventDefault();
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    setOpen(nextOpen);
    if (!nextOpen && !isControlledSearch) setUncontrolledQuery("");
  };

  const showClearButton =
    !disabled && (value.length > 0 || emptyTag !== undefined);
  const showEmpty = !loading && displayedOptions.length === 0;

  return (
    <Command
      label={label}
      shouldFilter={false}
      loop
      className="h-auto overflow-visible rounded-none bg-transparent"
    >
      <Popover open={!disabled && open} onOpenChange={handleOpenChange}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            data-tag-autocomplete-input
            onMouseDown={handleContainerMouseDown}
            className={cn(
              "ph-no-capture bg-background ring-offset-background border-input focus-within:ring-ring flex min-h-8 w-full items-center gap-1 rounded-md border py-1 pr-1 pl-1.5 text-sm focus-within:ring-2 focus-within:ring-offset-2",
              error &&
                "border-destructive focus-within:ring-destructive/40 focus-within:ring-offset-0",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {value.length === 0 && emptyTag ? (
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
                value.map((item, index) => (
                  <TagAutocompleteChip
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
                aria-describedby={describedById}
                aria-invalid={error || undefined}
                className="placeholder:text-muted-foreground h-6 min-w-28 flex-1 border-0 bg-transparent p-0 px-1 text-sm shadow-none outline-hidden focus:ring-0 disabled:cursor-not-allowed"
                placeholder={placeholder}
                value={query}
                onValueChange={handleQueryChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
            {showClearButton ? (
              <button
                type="button"
                aria-label={clearLabel}
                tabIndex={-1}
                className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-sm"
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
          className="w-(--radix-popover-trigger-width) min-w-0 overflow-hidden p-0"
        >
          <CommandList className="ph-no-capture max-h-96 p-1.5">
            {displayedOptions.map((option) => (
              <TagAutocompleteOptionItem
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
