/**
 * SearchBar - Search UI component
 *
 * Provides search input with match navigation (prev/next).
 * Shows match count and current match index.
 */

import { useState, useEffect } from "react";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { type SearchMatch } from "../types";

interface SearchBarProps {
  onSearch: (query: string) => void;
  matches: SearchMatch[];
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onClear: () => void;
  placeholder?: string;
  /** Controlled query value (for external state management) */
  value?: string;
  /** Callback for immediate query changes (no debounce) */
  onValueChange?: (value: string) => void;
}

export function SearchBar({
  onSearch,
  matches,
  currentIndex,
  onNext,
  onPrevious,
  onClear,
  placeholder = "Search JSON...",
  value: controlledValue,
  onValueChange,
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState("");

  const isControlled =
    controlledValue !== undefined && onValueChange !== undefined;
  const query = isControlled ? controlledValue : internalQuery;

  // Debounced search (only when uncontrolled)
  useEffect(() => {
    if (isControlled) return; // Skip debouncing for controlled mode

    const timer = setTimeout(() => {
      onSearch(internalQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [internalQuery, onSearch, isControlled]);

  const handleClear = () => {
    if (isControlled) {
      onValueChange("");
      onSearch("");
    } else {
      setInternalQuery("");
    }
    onClear();
  };

  const handleChange = (value: string) => {
    if (isControlled) {
      onValueChange(value);
      // In controlled mode, parent handles debouncing, so call onSearch immediately
      onSearch(value);
    } else {
      setInternalQuery(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length > 0) {
        if (e.shiftKey) {
          onPrevious();
        } else {
          onNext();
        }
      }
    } else if (e.key === "Escape") {
      handleClear();
    }
  };

  const hasMatches = matches.length > 0;
  const showControls = query.trim() !== "";

  return (
    <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
      {/* Search input */}
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border bg-background px-2 py-1">
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 border-none bg-transparent text-sm focus:outline-none focus:ring-0"
          aria-label="Search JSON"
        />

        {/* Match counter */}
        {showControls && (
          <span
            className="min-w-[70px] whitespace-nowrap text-right text-xs text-muted-foreground"
            aria-live="polite"
          >
            {hasMatches
              ? `${currentIndex + 1} of ${matches.length}`
              : "No matches"}
          </span>
        )}
      </div>

      {/* Navigation buttons */}
      {showControls && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasMatches}
            className="inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Previous match (Shift+Enter)"
            title="Previous match (Shift+Enter)"
          >
            <ChevronUp size={16} />
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!hasMatches}
            className="inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next match (Enter)"
            title="Next match (Enter)"
          >
            <ChevronDown size={16} />
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Clear search (Escape)"
            title="Clear search (Escape)"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
