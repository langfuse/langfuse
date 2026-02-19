/**
 * Debug utilities for AdvancedJsonViewer
 *
 * Provides conditional logging that only runs in development mode.
 * In production builds, these become no-ops for better performance.
 */

const DEBUG = process.env.NODE_ENV === "development";

/**
 * Log to console in development only
 */
export const debugLog = (...args: unknown[]) => {
  if (DEBUG) console.log(...args);
};

/**
 * Start performance timer in development only
 */
export const debugTime = (label: string) => {
  if (DEBUG) console.time(label);
};

/**
 * End performance timer in development only
 */
export const debugTimeEnd = (label: string) => {
  if (DEBUG) console.timeEnd(label);
};

/**
 * Log warning in development only
 */
export const debugWarn = (...args: unknown[]) => {
  if (DEBUG) console.warn(...args);
};

/**
 * Log error (always logs, even in production)
 */
export const debugError = (...args: unknown[]) => {
  console.error(...args);
};
