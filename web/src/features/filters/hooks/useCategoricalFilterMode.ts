import { useState } from "react";
import { type TextFilterEntry } from "@/src/features/filters/hooks/useSidebarFilterState";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function useCategoricalFilterMode({
  filterKey,
  tableName,
  isV4,
  textFilters,
}: {
  filterKey: string;
  tableName: string | undefined;
  isV4: boolean;
  textFilters?: TextFilterEntry[];
}) {
  const capture = usePostHogClientCapture();
  const hasTextFilters = (textFilters?.length ?? 0) > 0;
  const [mode, setMode] = useState<"select" | "text">(() =>
    hasTextFilters ? "text" : "select",
  );
  const [prevHasTextFilters, setPrevHasTextFilters] = useState(hasTextFilters);

  // URL filters can arrive after mount. Adopt newly applied text filters,
  // while keeping the user's chosen mode when the last filter is removed.
  if (hasTextFilters !== prevHasTextFilters) {
    setPrevHasTextFilters(hasTextFilters);
    if (hasTextFilters) setMode("text");
  }

  const onModeChange = (nextMode: "select" | "text") => {
    setMode(nextMode);
    capture("filters:facet_mode_switched", {
      tableName,
      column: filterKey,
      mode: nextMode,
      isV4,
    });
  };

  return { mode, onModeChange };
}
