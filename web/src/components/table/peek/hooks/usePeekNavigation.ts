import { getPathnameWithoutBasePath } from "@/src/utils/api";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { useRouter } from "next/router";
import { useCallback } from "react";

interface PeekConfig {
  /** Additional URL parameters to clear when closing peek view */
  urlParamsToClear?: string[];
  /** URL parameters to set to the same value as the peek ID (e.g., "observation" for observations table) */
  urlParamsToSetToPeekId?: string[];
}

export const usePeekNavigation = (config?: PeekConfig) => {
  const router = useRouter();

  const onOpenChange = useCallback(
    (
      open: boolean,
      id?: string,
      additionalUrlParams?: Record<string, string>,
    ) => {
      const currentQuery = { ...router.query };
      const pathname = getPathnameWithoutBasePath();

      if (!open || !id) {
        // Close peek view - clear all peek-related params
        delete currentQuery.peek;
        config?.urlParamsToClear?.forEach(
          (param) => delete currentQuery[param],
        );
      } else {
        // Open peek view
        currentQuery.peek = id;

        // Set additional parameters
        if (additionalUrlParams) {
          Object.entries(additionalUrlParams).forEach(([key, value]) => {
            currentQuery[key] = value;
          });
        }
      }

      router.push(
        {
          pathname,
          query: currentQuery,
        },
        undefined,
        { shallow: true },
      );
    },
    [router, config],
  );

  const getNavigationPath = useCallback(
    (entry: ListEntry) => {
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

      // Set URL params to the same value as peek ID
      config?.urlParamsToSetToPeekId?.forEach((param) => {
        params.set(param, entry.id);
      });

      // Set the search part of the URL
      return `${url.pathname}?${params.toString()}`;
    },
    [config],
  );

  return { onOpenChange, getNavigationPath };
};
