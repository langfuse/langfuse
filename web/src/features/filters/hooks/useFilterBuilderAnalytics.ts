import { type ComponentProps } from "react";
import { type FilterBuilderDropdown } from "@/src/components/design-system/FilterBuilderDropdown/FilterBuilderDropdown";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function useFilterBuilderAnalytics(tableName: string, isV4: boolean) {
  const capture = usePostHogClientCapture();

  const onAnalyticsEvent: NonNullable<
    ComponentProps<typeof FilterBuilderDropdown>["onAnalyticsEvent"]
  > = (event) => {
    const context = { tableName, isV4 };
    if (event.type === "opened") {
      capture("table:filter_builder_open", context);
      return;
    }
    if (event.type === "closed") {
      capture("table:filter_builder_close", {
        ...context,
        filterCount: event.filterCount,
      });
      return;
    }

    const { type, ...properties } = event;
    capture(type === "applied" ? "filters:applied" : "filters:cleared", {
      ...context,
      surface: "filter_builder",
      ...properties,
    });
  };

  return onAnalyticsEvent;
}
