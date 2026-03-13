import { api } from "@/src/utils/api";
import {
  getEventMetadataSuggestionsQueryInput,
  SHARED_EVENT_FILTER_QUERY_OPTIONS,
  type UseEventsFilterOptionsParams,
} from "./useEventsFilterOptions";

type UseEventMetadataFilterOptionsParams = Pick<
  UseEventsFilterOptionsParams,
  "projectId" | "oldFilterState"
> & {
  enabled: boolean;
};

export function useEventMetadataFilterOptions({
  projectId,
  oldFilterState,
  enabled,
}: UseEventMetadataFilterOptionsParams) {
  const metadataSuggestions = api.events.metadataKeySuggestions.useQuery(
    getEventMetadataSuggestionsQueryInput({
      projectId,
      oldFilterState,
    }),
    {
      ...SHARED_EVENT_FILTER_QUERY_OPTIONS,
      enabled,
      placeholderData: (prev) => prev,
    },
  );

  return {
    metadataOptions: metadataSuggestions.data ?? undefined,
    isMetadataOptionsPending: metadataSuggestions.isPending,
  };
}
