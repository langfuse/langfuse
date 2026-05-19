/* internal.ts is internal to the monitor implementation. Do NOT export from the package barrel. */

/**
 * SECOND is one second in milliseconds.
 */
export const SECOND = 1000n;

/**
 * MINUTE one minute in milliseconds.
 */
export const MINUTE = 60n * SECOND;

/**
 * HOUR is one hour in milliseconds.
 */
export const HOUR = 60n * MINUTE;

/**
 * DAY is one day in milliseconds.
 */
export const DAY = 24n * HOUR;

/**
 * WEEK is one week in milliseconds.
 */
export const WEEK = 7n * DAY;
