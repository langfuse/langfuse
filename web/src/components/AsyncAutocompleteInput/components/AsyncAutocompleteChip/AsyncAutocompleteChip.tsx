import { createElement, type MouseEvent } from "react";
import { X } from "@langfuse/icons";

import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/types/asyncAutocompleteOption";
import { Tag, TagShell } from "@/src/components/design-system/Tag/Tag";
import { cn } from "@/src/utils/tailwind";

export type AsyncAutocompleteChipProps<V extends string> = {
  item: AsyncAutocompleteOption<V>;
  /** Highlighted via keyboard navigation from the inline input. */
  isActive: boolean;
  disabled?: boolean;
  onEdit?: (item: AsyncAutocompleteOption<V>) => void;
  onRemove: (value: V) => void;
};

export function AsyncAutocompleteChip<V extends string>({
  item,
  isActive,
  disabled,
  onEdit,
  onRemove,
}: AsyncAutocompleteChipProps<V>) {
  const isRemoveDisabled = Boolean(disabled || item.disabled);
  const secondaryText = item.showSecondaryLabelInTag
    ? item.secondaryLabel
    : undefined;

  const handleRemove = () => {
    if (!isRemoveDisabled) onRemove(item.value);
  };

  const handleRemoveClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handleRemove();
  };

  const handleKeepFocus = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const handleEditClick = () => {
    if (!disabled) onEdit?.(item);
  };

  const needsCustomShell = Boolean(onEdit || item.strikethrough || item.title);

  return (
    <span
      data-active={isActive || undefined}
      className="data-active:ring-ring flex min-w-0 rounded-sm data-active:ring-2"
    >
      {needsCustomShell ? (
        <TagShell>
          {item.icon
            ? createElement(item.icon, {
                size: "sm",
                color: "tertiary",
                "aria-hidden": true,
              })
            : null}
          {onEdit ? (
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={`Edit ${item.value}`}
              title={item.title ?? item.label}
              className={cn(
                "min-w-0 cursor-text truncate py-0.5 disabled:cursor-not-allowed",
                item.strikethrough && "line-through",
              )}
              onMouseDown={handleKeepFocus}
              onClick={handleEditClick}
            >
              {item.label}
            </button>
          ) : (
            <span
              title={item.title ?? item.label}
              className={cn(
                "min-w-0 truncate py-0.5",
                item.strikethrough && "line-through",
              )}
            >
              {item.label}
            </span>
          )}
          <button
            type="button"
            disabled={isRemoveDisabled}
            aria-label={`Remove ${item.label}`}
            className="text-foreground-tertiary hover:text-foreground -mr-0.5 flex shrink-0 items-center rounded-sm disabled:cursor-not-allowed"
            onClick={handleRemoveClick}
          >
            <X size="sm" />
          </button>
        </TagShell>
      ) : (
        <Tag
          text={item.label}
          secondaryText={secondaryText}
          icon={item.icon}
          remove={{ onRemove: handleRemove, disabled: isRemoveDisabled }}
        />
      )}
    </span>
  );
}
