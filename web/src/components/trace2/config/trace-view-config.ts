/**
 * Configuration constants for trace2 views.
 *
 * Centralizes thresholds, dimensions, and behavior settings
 * for easier tuning and maintenance.
 */

export const TRACE_VIEW_CONFIG = {
  /**
   * Log View configuration
   */
  logView: {
    /**
     * Number of observations above which virtualization is enabled.
     * Virtualization renders only visible rows for better performance.
     */
    virtualizationThreshold: 350,

    /**
     * Number of observations above which download uses cached I/O only.
     * Above this threshold, only expanded observations include full I/O data.
     */
    downloadThreshold: 350,

    /**
     * Row heights for virtualization calculations
     */
    rowHeight: {
      collapsed: 28,
      expanded: 150,
    },

    /**
     * Maximum tree depth for indent visualization.
     * Deeper trees disable indent to prevent excessive horizontal space.
     */
    maxIndentDepth: 5,

    /**
     * Indent size per level (in pixels)
     */
    indentPx: 12,

    /**
     * Prefetching behavior for viewport-based observation loading
     */
    prefetch: {
      /**
       * Margin around viewport for triggering prefetch (e.g., "100px")
       * Observations within this margin will be prefetched.
       */
      rootMargin: "100px",

      /**
       * Debounce delay in milliseconds before triggering prefetch.
       * Prevents request storms during fast scrolling.
       */
      debounceMs: 250,
    },

    /**
     * Batch fetching configuration for loading all observations
     */
    batchFetch: {
      /**
       * Maximum number of concurrent observation fetch requests
       */
      concurrency: 10,
    },
  },
} as const;
