import { useQueryParams, StringParam, withDefault } from "use-query-params";
import { useMemo } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";

export type EventsViewMode = "observation" | "trace";

export interface UseEventsViewModeOutput {
  viewMode: EventsViewMode;
  setViewMode: (mode: EventsViewMode) => void;
}

export function useEventsViewMode(projectId: string): UseEventsViewModeOutput {
  const defaultMode: EventsViewMode = "trace";

  const [storedViewMode, setStoredViewMode] = useSessionStorage<EventsViewMode>(
    `eventsViewMode-${projectId}`,
    defaultMode,
  );

  const [queryParams, setQueryParams] = useQueryParams({
    viewMode: withDefault(StringParam, storedViewMode),
  });

  return useMemo(() => {
    const rawMode = queryParams.viewMode;
    const viewMode: EventsViewMode =
      rawMode === "observation" || rawMode === "trace" ? rawMode : defaultMode;

    const setViewMode = (mode: EventsViewMode) => {
      setQueryParams({ viewMode: mode });
      setStoredViewMode(mode);
    };

    return {
      viewMode,
      setViewMode,
    };
  }, [queryParams.viewMode, setQueryParams, setStoredViewMode]);
}
