import { getPathnameWithoutBasePath } from "@/src/utils/api";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { useRouter } from "next/router";
import { useCallback } from "react";
import { urlSearchParamsToQuery } from "@/src/utils/navigation";

const PEEK_PARAM = "peek";

interface BasePeekConfig {
  /** Additional URL parameters to clear when closing peek view and persist when expanding peek view */
  queryParams?: string[];
  /**
   * Creates semantic URL parameters alongside the universal "peek" parameter.
   *
   * Detail navigation components always set peek=itemId universally. We may need to semantically track additional params due to implementation details in
   * peek detail child components. Please note that you should not be expected to use this setting often, unless you have complex prebuilt URL param
   * expectations in your child component.
   *
   * Example for observations table with paramsToMirrorPeekValue: ["observation"]:
   * - Opening observation "obs123" sets: peek=obs123 AND observation=obs123
   * - When user navigates in the trace tree, changes to the observation param occur, but the peek param remains the same.
   */
  paramsToMirrorPeekValue?: string[];
  /** Function to extract additional URL parameters values from a row when opening peek view */
  extractParamsValuesFromRow?: (row: any) => Record<string, string>;
}

interface PeekConfig extends BasePeekConfig {
  expandConfig?: never;
}

interface PeekConfigWithExpand extends BasePeekConfig {
  /** Configuration for expanding peek view */
  expandConfig: {
    basePath: string;
    /** URL parameter to use for path param (defaults to "peek") */
    pathParam?: string;
  };
}

interface BasePeekNavigation {
  /** Open or close peek view. Pass id to open */
  openPeek: (id?: string, row?: any) => void;
  /** Close the peek view */
  closePeek: () => void;
  /** Resolve the navigation path for a detail entry */
  resolveDetailNavigationPath: (entry: ListEntry) => string;
}

interface PeekNavigation extends BasePeekNavigation {}

interface PeekNavigationWithExpand extends BasePeekNavigation {
  /** Expand the peek view to the full detail page */
  expandPeek: (openInNewTab: boolean) => void;
}

/**
 * Hook for managing peek navigation. Returns expandPeek function only when expandConfig is provided.
 * @param config Configuration for peek behavior. Include expandConfig to get expandPeek functionality.
 * @returns Navigation functions. Includes expandPeek when expandConfig is provided.
 */
export function usePeekNavigation(
  config: PeekConfigWithExpand,
): PeekNavigationWithExpand;
export function usePeekNavigation(config?: PeekConfig): PeekNavigation;
export function usePeekNavigation(config?: PeekConfig | PeekConfigWithExpand) {
  const router = useRouter();

  const openPeek = useCallback(
    (id?: string, row?: any) => {
      const pathname = getPathnameWithoutBasePath();
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);

      if (!id) {
        // Close peek view - clear all peek-related params
        params.delete(PEEK_PARAM);
        config?.queryParams?.forEach((param) => params.delete(param));
      } else {
        // Clear all query params that are set in the config
        config?.queryParams?.forEach((param) => params.delete(param));

        // Open peek view
        params.set(PEEK_PARAM, id);

        // Set URL params to the same value as peek ID
        config?.paramsToMirrorPeekValue?.forEach((param) => {
          params.set(param, id);
        });

        // Set additional parameters from row transformation
        if (row && config?.extractParamsValuesFromRow) {
          const additionalParams = config.extractParamsValuesFromRow(row);
          Object.entries(additionalParams).forEach(([key, value]) => {
            params.set(key, value);
          });
        }
      }

      router.push(
        {
          pathname,
          query: urlSearchParamsToQuery(params),
        },
        undefined,
        { shallow: true },
      );
    },
    [router, config],
  );

  const closePeek = useCallback(() => {
    const pathname = getPathnameWithoutBasePath();
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);

    // Close peek view - clear all peek-related params
    params.delete(PEEK_PARAM);
    config?.queryParams?.forEach((param) => params.delete(param));

    router.push(
      {
        pathname,
        query: urlSearchParamsToQuery(params),
      },
      undefined,
      { shallow: true },
    );
  }, [router, config]);

  const resolveDetailNavigationPath = useCallback(
    (entry: ListEntry) => {
      const url = new URL(window.location.href);
      const pathname = getPathnameWithoutBasePath();

      // Update the path part
      url.pathname = pathname;

      // Keep all existing query params
      const params = new URLSearchParams(url.search);

      // Update any query params that exist in entry.params
      if (entry.params) {
        // Clear all query params that are set in the config
        config?.queryParams?.forEach((param) => params.delete(param));

        Object.entries(entry.params).forEach(([key, value]) => {
          params.set(key, encodeURIComponent(value));
        });
      }

      // Update peek param to the new id
      params.set(PEEK_PARAM, entry.id);

      // Set URL params to the same value as peek ID
      config?.paramsToMirrorPeekValue?.forEach((param) => {
        params.set(param, entry.id);
      });

      // Set the search part of the URL
      return `${url.pathname}?${params.toString()}`;
    },
    [config],
  );

  const expandPeek = useCallback(
    (openInNewTab: boolean) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const pathParam = config?.expandConfig?.pathParam ?? PEEK_PARAM;

      const pathname = `${config?.expandConfig?.basePath}/${params.get(pathParam)}`;
      const queryParams = config?.queryParams
        ?.map((param) => {
          const value = params.get(param);
          return value ? `${param}=${value}` : null;
        })
        .filter(Boolean)
        .join("&");
      const pathnameWithQuery = `${pathname}?${queryParams}`;

      if (openInNewTab) {
        const pathnameWithBasePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${pathnameWithQuery}`;
        window.open(pathnameWithBasePath, "_blank");
      } else {
        router.push(pathnameWithQuery);
      }
    },
    [router, config],
  );

  const baseNavigation = {
    openPeek,
    closePeek,
    resolveDetailNavigationPath,
  };

  if (config?.expandConfig) {
    return {
      ...baseNavigation,
      expandPeek,
    } as PeekNavigationWithExpand;
  }

  return baseNavigation as PeekNavigation;
}
