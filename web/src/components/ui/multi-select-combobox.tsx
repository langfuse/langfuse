import { useState, useEffect, useRef } from "react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { Search, X, MoreHorizontal } from "lucide-react";

interface MultiSelectComboboxProps<T> {
  selectedItems: T[];
  onItemsChange: (items: T[]) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: T[];
  isLoading?: boolean;
  placeholder?: string;
  hasMoreResults?: boolean;
  renderItem: (
    item: T,
    isSelected: boolean,
    onToggle: () => void,
  ) => React.ReactNode;
  renderSelectedItem: (item: T, onRemove: () => void) => React.ReactNode;
  getItemKey: (item: T) => string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  showSelectedItemsInInput?: boolean;
  dropdownClassName?: string;
}

export function MultiSelectCombobox<T>({
  selectedItems,
  onItemsChange,
  searchQuery,
  onSearchChange,
  searchResults,
  isLoading = false,
  placeholder = "Search...",
  hasMoreResults = false,
  renderItem,
  renderSelectedItem,
  getItemKey,
  disabled = false,
  onOpenChange,
  showSelectedItemsInInput = true,
  dropdownClassName,
}: MultiSelectComboboxProps<T>) {
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [previousResults, setPreviousResults] = useState<T[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle focus/blur for dropdown visibility
  const handleInputFocus = () => {
    setIsInputFocused(true);
    setShowDropdown(true);
    onOpenChange?.(true);
  };

  const handleInputBlur = () => {
    setIsInputFocused(false);
    // Delay hiding dropdown to allow clicking on dropdown items
    setTimeout(() => {
      if (!isInputFocused) {
        setShowDropdown(false);
        onOpenChange?.(false);
      }
    }, 200);
  };

  // Auto-scroll to input when items are added/removed
  useEffect(() => {
    if (inputRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [selectedItems.length]);

  // Update previous results when new data arrives (not loading)
  useEffect(() => {
    if (!isLoading && searchResults.length > 0) {
      setPreviousResults(searchResults);
    }
  }, [isLoading, searchResults]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        containerRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
        setIsInputFocused(false);
        onOpenChange?.(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showDropdown, onOpenChange]);

  const handleItemToggle = (item: T) => {
    const itemKey = getItemKey(item);
    const isSelected = selectedItems.some(
      (selected) => getItemKey(selected) === itemKey,
    );

    if (isSelected) {
      onItemsChange(
        selectedItems.filter((selected) => getItemKey(selected) !== itemKey),
      );
    } else {
      onItemsChange([...selectedItems, item]);
    }

    // Keep dropdown open after item toggle
    setShowDropdown(true);
    setIsInputFocused(true);
  };

  const handleItemRemove = (item: T) => {
    const itemKey = getItemKey(item);
    onItemsChange(
      selectedItems.filter((selected) => getItemKey(selected) !== itemKey),
    );
  };

  return (
    <div className="space-y-2">
      {/* Custom Input with Embedded Pills */}
      <div className="relative">
        <div
          ref={containerRef}
          className="flex max-h-14 min-h-9 w-full overflow-y-auto rounded-md border border-input bg-background text-xs"
        >
          <Search className="absolute left-2 top-2.5 z-10 h-4 w-4 text-muted-foreground" />
          <div className="flex max-h-full flex-1 flex-wrap items-center gap-1 pl-8">
            {/* Selected Items Pills */}
            {showSelectedItemsInInput
              ? selectedItems.map((item) => (
                  <div key={getItemKey(item)}>
                    {renderSelectedItem(item, () => handleItemRemove(item))}
                  </div>
                ))
              : null}
            {/* Search Input */}
            <Input
              ref={inputRef}
              type="text"
              placeholder={
                showSelectedItemsInInput
                  ? selectedItems.length === 0
                    ? placeholder
                    : ""
                  : placeholder
              }
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              disabled={disabled}
              className="min-w-24 flex-1 border-none bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1 h-7 w-7 p-0"
              onClick={() => onSearchChange("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Search Results Dropdown */}
      {showDropdown && (
        <div ref={dropdownRef} className="relative">
          {searchResults.length > 0 ||
          (isLoading && previousResults.length > 0) ? (
            <div
              className={
                dropdownClassName ??
                "absolute top-0 z-10 max-h-48 w-full overflow-y-auto rounded-md border bg-background shadow-md"
              }
              onMouseDown={(e) => e.preventDefault()}
              onWheel={(e) => e.stopPropagation()}
            >
              {(isLoading && previousResults.length > 0
                ? previousResults
                : searchResults
              ).map((item, index, array) => (
                <div key={getItemKey(item)}>
                  {renderItem(
                    item,
                    selectedItems.some(
                      (selected) => getItemKey(selected) === getItemKey(item),
                    ),
                    () => handleItemToggle(item),
                  )}
                  {(index < array.length - 1 || hasMoreResults) && (
                    <div className="border-b border-border/50" />
                  )}
                </div>
              ))}
              {hasMoreResults && (
                <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs italic">
                      More results available, refine your search
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="absolute top-0 z-10 w-full rounded-md border bg-background py-6 text-center text-xs text-muted-foreground shadow-md">
              {searchQuery
                ? `No results found for "${searchQuery}"`
                : "No results available"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
