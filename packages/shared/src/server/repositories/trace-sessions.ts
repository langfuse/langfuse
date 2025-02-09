import z from "zod";
import { prisma } from "../../db";
import { singleFilter, stringOptionsFilter } from "../../interfaces/filters";

export const getPublicSessionsFilter = async (
  projectId: string,
  filter: z.infer<typeof singleFilter>[],
) => {
  const sessionsBookmarkedFilter = filter?.find((f) => f.column === "⭐️");

  // we are only fetching bookmarked sessions.
  // They need to be manipulated in the UI and should not be as many.
  const filteredSessions = sessionsBookmarkedFilter
    ? await prisma.traceSession.findMany({
        where: {
          projectId: projectId,
          bookmarked: true,
        },
        select: {
          id: true,
          createdAt: true,
          bookmarked: true,
          public: true,
        },
      })
    : [];

  const additionalBookmarkFilter: z.infer<typeof stringOptionsFilter>[] =
    sessionsBookmarkedFilter &&
    typeof sessionsBookmarkedFilter.value === "boolean" &&
    ((sessionsBookmarkedFilter.value === true &&
      sessionsBookmarkedFilter.operator === "=") ||
      (sessionsBookmarkedFilter.value === false &&
        sessionsBookmarkedFilter.operator === "<>"))
      ? [
          {
            column: "id",
            type: "stringOptions" as const,
            operator: "any of" as const,
            value: filteredSessions.map((s) => s.id),
          },
        ]
      : sessionsBookmarkedFilter &&
          typeof sessionsBookmarkedFilter.value === "boolean" &&
          (sessionsBookmarkedFilter.value === false ||
            (sessionsBookmarkedFilter.value === true &&
              sessionsBookmarkedFilter.operator === "<>"))
        ? [
            {
              column: "id",
              type: "stringOptions" as const,
              operator: "none of" as const,
              value: filteredSessions.map((s) => s.id),
            },
          ]
        : [];

  return filter
    ? [...filter.filter((f) => f.column !== "⭐️"), ...additionalBookmarkFilter]
    : [...additionalBookmarkFilter];
};
