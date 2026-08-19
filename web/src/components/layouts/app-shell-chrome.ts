/**
 * Top chrome row shared by the sidebar logo strip and the page-header first
 * row. Height and the bottom border live on this same box so the sidebar's
 * `border-r` forms a single-pixel T-junction with the divider, instead of a
 * stair-step from mismatched row heights.
 */
export const APP_SHELL_CHROME_ROW_CLASS =
  "flex min-h-11 items-center border-b px-3";

export const APP_SHELL_CHROME_ROW_TEST_ID = "app-shell-chrome-row";
