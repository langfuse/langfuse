/**
 * SearchContext - Isolated search state management
 *
 * Manages search input and query with debouncing, separate from selection/tree UI state
 * to avoid unnecessary re-renders of unrelated components.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface SearchContextValue {
  searchQuery: string;
  searchInputValue: string;
  setSearchInputValue: (value: string) => void;
  setSearchQueryImmediate: (value: string) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

interface SearchProviderProps {
  children: ReactNode;
}

export function SearchProvider({ children }: SearchProviderProps) {
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Debounced update - wait 500ms after user stops typing
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchQuery(searchInputValue);
    }, 500);

    return () => clearTimeout(timeout);
  }, [searchInputValue]);

  // Immediate update - for Enter key or programmatic updates
  const setSearchQueryImmediate = useCallback((value: string) => {
    setSearchInputValue(value);
    setSearchQuery(value);
  }, []);

  return (
    <SearchContext.Provider
      value={{
        searchQuery,
        searchInputValue,
        setSearchInputValue,
        setSearchQueryImmediate,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within SearchProvider");
  }
  return context;
}
