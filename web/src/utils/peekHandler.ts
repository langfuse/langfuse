import { getPathnameWithoutBasePath } from "@/src/utils/api";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";

interface PeekConfig {
  /** Additional URL parameters to clear when closing peek view */
  urlParamsToClear?: string[];
  /** Additional URL parameters to set during navigation (e.g., "observation" for observations) */
  navigationUrlParams?: string[];
}

export const createPeekHandler = (config?: PeekConfig) => {
  const onOpenChange = (
    open: boolean,
    id?: string,
    additionalUrlParams?: Record<string, string>,
  ) => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const pathname = getPathnameWithoutBasePath();

    if (!open || !id) {
      // Close peek view - clear all peek-related params
      params.delete("peek");
      config?.urlParamsToClear?.forEach((param) => params.delete(param));
    } else {
      // Open peek view
      params.set("peek", id);

      // Set additional parameters
      if (additionalUrlParams) {
        Object.entries(additionalUrlParams).forEach(([key, value]) => {
          params.set(key, value);
        });
      }
    }

    const newUrl = `${pathname}?${params.toString()}`;
    window.history.pushState(null, "", newUrl);
  };

  const getNavigationPath = (entry: ListEntry) => {
    const url = new URL(window.location.href);
    const pathname = getPathnameWithoutBasePath();

    // Update the path part
    url.pathname = pathname;

    // Keep all existing query params
    const params = new URLSearchParams(url.search);

    // Update timestamp if it exists in entry.params
    if (entry.params) {
      Object.entries(entry.params).forEach(([key, value]) => {
        params.set(key, encodeURIComponent(value));
      });

      // Clear observation param (this is done in traces and observations)
      config?.urlParamsToClear?.forEach((param) => params.delete(param));
    }

    // Update peek param to the new id
    params.set("peek", entry.id);

    // Set additional navigation params based on config
    config?.navigationUrlParams?.forEach((param) => {
      // TODO: figure out if this is needed
      if (param === "observation") {
        // For observations, set observation param to the entry id
        params.set("observation", entry.id);
      }
    });

    // Set the search part of the URL
    return `${url.pathname}?${params.toString()}`;
  };

  return { onOpenChange, getNavigationPath };
};
