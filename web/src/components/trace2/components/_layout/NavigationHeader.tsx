/**
 * NavigationHeader - Fixed-height search bar for navigation panel
 *
 * Responsibilities:
 * - Render search input
 * - Render toolbar buttons (expand/collapse, settings, download, timeline)
 * - Manage search input state via SearchContext
 *
 * This component has a fixed height and uses flex-shrink-0 to maintain size.
 */

import { useSearch } from "../../contexts/SearchContext";
import { Command, CommandInput } from "@/src/components/ui/command";

export function NavigationHeader() {
  const { searchInputValue, setSearchInputValue } = useSearch();

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // TODO: Implement immediate search on Enter
    }
  };

  return (
    <Command className="mt-1 flex h-auto flex-shrink-0 flex-col gap-1 overflow-hidden rounded-none border-b">
      <div className="flex flex-row justify-between pl-1 pr-2">
        <div className="relative flex-1">
          <CommandInput
            showBorder={false}
            placeholder="Search"
            className="h-7 min-w-20 border-0 pr-0 focus:ring-0"
            value={searchInputValue}
            onValueChange={setSearchInputValue}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <div className="flex flex-row items-center gap-0.5">
          {/* TODO: Add expand/collapse all, settings, download, timeline toggle buttons here (S9) */}
        </div>
      </div>
    </Command>
  );
}
