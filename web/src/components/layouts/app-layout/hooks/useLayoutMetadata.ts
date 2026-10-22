/**
 * Hook to generate layout metadata (page titles, favicons, etc.)
 * Based on active navigation and environment
 */

import { useMemo } from "react";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { env } from "@/src/env.mjs";
import type { NavigationItem } from "@/src/components/layouts/utilities/routes";

/**
 * Generates metadata for the layout including:
 * - Dynamic page title based on active route
 * - Region-specific favicon (dev vs production)
 * - Apple touch icon path
 *
 * @param activePathName - Title of the currently active navigation item
 * @param navigation - Full navigation array for finding active item
 * @returns Metadata object with title and icon paths
 */
export function useLayoutMetadata(
  activePathName: string | undefined,
  _navigation: NavigationItem[],
) {
  const { region } = useLangfuseCloudRegion();

  return useMemo(() => {
    const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

    // Determine page title from active route
    const title = activePathName ? `${activePathName} | Langfuse` : "Langfuse";

    // Use dev favicon in DEV region for visual distinction
    // Using SVG for modern browsers with PNG fallback specified in sizes
    const faviconPath =
      region === "DEV" ? `${basePath}/icon-dev.svg` : `${basePath}/icon.svg`;

    return {
      title,
      faviconPath,
      // PNG icons with sizes for broader browser compatibility
      favicon256Path: `${basePath}/icon256.png`,
      appleTouchIconPath: `${basePath}/apple-touch-icon.png`,
    };
  }, [activePathName, region]);
}
