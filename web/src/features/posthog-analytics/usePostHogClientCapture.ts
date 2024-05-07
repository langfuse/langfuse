import { type CaptureResult, type CaptureOptions } from "posthog-js";
import { usePostHog } from "posthog-js/react";

// resource:action, only use snake_case
const events = {
  table: [
    "filter_builder_open",
    "filter_builder_close",
    "search_submit",
    "row_height_switch_select",
    "pagination_button_click",
    "pagination_page_size_select",
    "column_visibility_change",
    "column_sorting_header_click",
    "bookmark_button_click",
  ],
} as const;

// type that represents all possible event names, e.g. "traces:bookmark"
type EventName = {
  [Resource in keyof typeof events]: `${Resource}:${(typeof events)[Resource][number]}`;
}[keyof typeof events];

export const usePostHogClientCapture = () => {
  const posthog = usePostHog();

  // wrapped posthog.capture function that only allows events that are in the allowlist
  function capture(
    eventName: EventName,
    properties?: Record<string, any> | null,
    options?: CaptureOptions,
  ): CaptureResult | void {
    return posthog.capture(eventName, properties, options);
  }

  return capture;
};
