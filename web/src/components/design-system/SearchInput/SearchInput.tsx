"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { cn } from "@/src/utils/tailwind";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onBlur?: (value: string) => void;
  size?: "default" | "large";
  dropdown?: {
    label: React.ReactNode;
    labelAccessory?: React.ReactNode;
    content: React.ReactNode;
  };
};

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      placeholder,
      disabled = false,
      autoFocus = false,
      onBlur,
      size = "default",
      dropdown,
    },
    ref,
  ) => (
    <div
      className={cn(
        "border-input bg-background focus-within:ring-ring flex w-full min-w-0 items-stretch overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-offset-0",
        size === "default" ? "h-8" : "h-9",
      )}
    >
      <button
        type="button"
        aria-label="Search"
        disabled={disabled}
        onClick={() => onSubmit(value)}
        className="text-foreground-tertiary hover:bg-accent hover:text-accent-foreground flex aspect-square shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Search className="h-4 w-4" />
      </button>
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={() => onBlur?.(value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit(value);
        }}
        className="placeholder:text-foreground-tertiary disabled:bg-muted/50 min-w-0 flex-1 appearance-none border-0 bg-transparent py-1 pr-2 pl-0 text-sm shadow-none outline-hidden focus:border-0 focus:shadow-none focus:ring-0 focus:ring-offset-0 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:cursor-pointer"
      />
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
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {dropdown.content}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  ),
);

SearchInput.displayName = "SearchInput";
