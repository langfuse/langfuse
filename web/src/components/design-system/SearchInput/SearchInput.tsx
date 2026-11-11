/* eslint-disable boundaries/dependencies */
"use client";

import * as React from "react";
import { Search, X } from "@langfuse/icons";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { cva, type VariantProps } from "class-variance-authority";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

const searchInputVariants = cva(
  "flex w-full min-w-0 items-stretch overflow-hidden",
  {
    variants: {
      size: {
        default: "h-8",
        large: "h-9",
      },
      variant: {
        default:
          "border-input bg-background focus-within:ring-ring rounded-md border focus-within:ring-2 focus-within:ring-offset-0",
        // For surfaces that frame the field themselves, e.g. a menu header.
        borderless: "bg-transparent",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
);

/** The square actions pinned to either end of the field. */
const edgeActionClassName =
  "text-foreground-tertiary hover:bg-accent hover:text-accent-foreground flex aspect-square shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50";

type SearchInputModeProps =
  | {
      /** Enter or the search icon submits the value. */
      mode?: "search";
      onSubmit: (value: string) => void;
    }
  | {
      /** Filters as you type; the search icon is decorative. */
      mode: "filter";
      onSubmit?: never;
    };

type SearchInputProps = SearchInputModeProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onBlur?: (value: string) => void;
  /** Runs before the field's own Enter handling; `preventDefault` skips the submit. */
  onBeforeKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  ariaLabel?: string;
  dropdown?: {
    label: React.ReactNode;
    labelAccessory?: React.ReactNode;
    content: React.ReactNode;
  };
} & VariantProps<typeof searchInputVariants>;

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      mode = "search",
      value,
      onChange,
      onSubmit,
      placeholder,
      disabled = false,
      autoFocus = false,
      onBlur,
      onBeforeKeyDown,
      ariaLabel,
      size = "default",
      variant = "default",
      dropdown,
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    return (
      <div className={searchInputVariants({ size, variant })}>
        {mode === "search" ? (
          <button
            type="button"
            aria-label="Search"
            disabled={disabled}
            onClick={() => onSubmit?.(value)}
            className={edgeActionClassName}
          >
            <Search size="base" aria-hidden />
          </button>
        ) : (
          <span className="flex aspect-square shrink-0 items-center justify-center">
            <Search size="base" color="muted" aria-hidden />
          </span>
        )}
        <input
          ref={inputRef}
          type="search"
          data-1p-ignore
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={() => onBlur?.(value)}
          aria-label={ariaLabel}
          onKeyDown={(event) => {
            onBeforeKeyDown?.(event);
            if (
              mode === "search" &&
              event.key === "Enter" &&
              !event.defaultPrevented
            ) {
              onSubmit?.(value);
            }
          }}
          className="placeholder:text-muted-foreground disabled:bg-muted/50 min-w-0 flex-1 appearance-none border-0 bg-transparent py-1 pr-2 pl-0 font-mono text-xs shadow-none outline-hidden focus:border-0 focus:shadow-none focus:ring-0 focus:ring-offset-0 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden"
        />
        {value !== "" && (
          <button
            type="button"
            aria-label="Clear search"
            disabled={disabled}
            // Not a tab stop, matching the native control it replaces.
            tabIndex={-1}
            // Prevent the input from blurring (and firing onBlur) when this
            // button is pressed. Without this, on mobile filter sheets the
            // onBlur handler submits the stale draft value before the click
            // handler can clear it.
            onMouseDown={(e) => e.preventDefault()}
            // The button unmounts as soon as the value clears, so hand focus to
            // the field rather than letting it fall to the document.
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className={edgeActionClassName}
          >
            <X size="base" aria-hidden />
          </button>
        )}
        {dropdown && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="hover:bg-accent hover:text-accent-foreground flex w-30 shrink-0 items-center justify-between gap-1 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-1">
                  <span
                    className="truncate"
                    title={
                      typeof dropdown.label === "string"
                        ? dropdown.label
                        : undefined
                    }
                  >
                    {dropdown.label}
                  </span>
                  {dropdown.labelAccessory}
                </span>
                <DropdownIndicator />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {dropdown.content}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";
