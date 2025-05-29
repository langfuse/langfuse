import { useCallback } from "react";

export interface UrlParamsState {
  peek?: string;
  timestamp?: string;
  observation?: string;
  display?: string;
}

export interface UseUrlParamsReturn {
  getCurrentParams: () => UrlParamsState;
  updateParams: (updates: Partial<UrlParamsState>) => void;
  clearParams: (paramNames: (keyof UrlParamsState)[]) => void;
}

/**
 * A simplified hook for managing URL parameters related to peek views and navigation.
 *
 * Provides stable utility functions for reading and updating URL parameters without
 * reactive state to avoid unnecessary re-renders.
 *
 * @param pathname - The current pathname to preserve when updating URL
 * @returns Object with utility functions for URL parameter management
 */
export const useUrlParams = (pathname: string): UseUrlParamsReturn => {
  // Get current URL parameters (call this when you need fresh values)
  const getCurrentParams = useCallback((): UrlParamsState => {
    const url = new URL(window.location.href);
    const searchParams = new URLSearchParams(url.search);

    return {
      peek: searchParams.get("peek") ?? undefined,
      timestamp: searchParams.get("timestamp") ?? undefined,
      observation: searchParams.get("observation") ?? undefined,
      display: searchParams.get("display") ?? undefined,
    };
  }, []);

  // Update multiple parameters at once
  const updateParams = useCallback(
    (updates: Partial<UrlParamsState>) => {
      const url = new URL(window.location.href);
      const searchParams = new URLSearchParams(url.search);

      // Apply updates
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined) {
          searchParams.delete(key);
        } else {
          searchParams.set(key, value);
        }
      });

      const newSearch = searchParams.toString();
      const newUrl = pathname + (newSearch ? `?${newSearch}` : "");

      window.history.replaceState(
        {
          ...window.history.state,
          as: newUrl,
          url: newUrl,
        },
        "",
        newUrl,
      );
    },
    [pathname],
  );

  // Clear specific parameters
  const clearParams = useCallback(
    (paramNames: (keyof UrlParamsState)[]) => {
      const url = new URL(window.location.href);
      const searchParams = new URLSearchParams(url.search);

      paramNames.forEach((paramName) => {
        searchParams.delete(paramName);
      });

      const newSearch = searchParams.toString();
      const newUrl = pathname + (newSearch ? `?${newSearch}` : "");

      window.history.replaceState(
        {
          ...window.history.state,
          as: newUrl,
          url: newUrl,
        },
        "",
        newUrl,
      );
    },
    [pathname],
  );

  return {
    getCurrentParams,
    updateParams,
    clearParams,
  };
};
