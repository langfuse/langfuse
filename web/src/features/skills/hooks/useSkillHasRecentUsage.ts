import { subDays } from "date-fns";
import { useState } from "react";
import { api } from "@/src/utils/api";

export function useSkillHasRecentUsage(projectId: string, name: string) {
  const [historyStartTime] = useState(() => subDays(new Date(), 14));
  const usage = api.events.all.useQuery(
    {
      projectId,
      filter: [
        {
          column: "skillNames",
          type: "arrayOptions",
          operator: "any of",
          value: [name],
        },
        {
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: historyStartTime,
        },
      ],
      searchQuery: null,
      searchType: ["id", "content"],
      orderBy: null,
      page: 1,
      limit: 1,
    },
    { refetchOnWindowFocus: false, staleTime: 60_000 },
  );

  return usage.isSuccess && !usage.isFetching
    ? usage.data.observations.length > 0
    : undefined;
}
