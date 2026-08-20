/**
 * Top chrome row shared by the sidebar logo strip and the page-header first
 * row. Height and the bottom border live on this same box so the sidebar's
 * `border-r` forms a single-pixel T-junction with the divider, instead of a
 * stair-step from mismatched row heights.
 *
 * Padding is call-site specific: the page-header row must stay full-width
 * (the divider has to reach the sidebar) while its *content* can be
 * container-capped on settings pages.
 */
export const APP_SHELL_CHROME_ROW_CLASS = "flex min-h-11 items-center border-b";

export const APP_SHELL_CHROME_ROW_TEST_ID = "app-shell-chrome-row";
