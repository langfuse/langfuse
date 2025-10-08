import z from "zod/v4";
import { prisma } from "../../db";
import { singleFilter } from "../../interfaces/filters";

export const getPublicSessionsFilter = async (
  projectId: string,
  filter: z.infer<typeof singleFilter>[],
) => {
  // Theoretically we should also filter the sessions by environment here. As this would return a huge list that's probably not feasible.
  // I.e. we only perform the environment check on the ClickHouse queries.

  const sessionsBookmarkedFilter = filter?.find((f) => f.column === "⭐️");

  let additionalBookmarkFilter: z.infer<typeof singleFilter>[] = [];
  if (sessionsBookmarkedFilter) {
    // We are only fetching bookmarked sessions.
    // They need to be manipulated in the UI and should not be as many.
    const filteredSessions = await prisma.traceSession.findMany({
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
    });

    // Check which operator we want to use for the bookmark filter.
    let operator: "any of" | "none of" | undefined = undefined;

    // If the value is true and we check for equality we include it or if the value is false and we check for inequality we include it.
    if (
      (sessionsBookmarkedFilter.value === true &&
        sessionsBookmarkedFilter.operator === "=") ||
      (sessionsBookmarkedFilter.value === false &&
        sessionsBookmarkedFilter.operator === "<>")
    ) {
      operator = "any of";
    }

    // Now we check the opposite case where the value should be none of the given values.
    if (
      sessionsBookmarkedFilter.value === false ||
      (sessionsBookmarkedFilter.value === true &&
        sessionsBookmarkedFilter.operator === "<>")
    ) {
      operator = "none of";
    }

    // Decide whether we want to propagate the bookmark filter down to the sessions queries
    additionalBookmarkFilter =
      operator && typeof sessionsBookmarkedFilter.value === "boolean"
        ? [
            {
              column: "id",
              type: "stringOptions" as const,
              operator,
              value: filteredSessions.map((s) => s.id),
            },
          ]
        : [];
  }

  return filter
    ? [...filter.filter((f) => f.column !== "⭐️"), ...additionalBookmarkFilter]
    : [...additionalBookmarkFilter];
};

export const hasAnySession = async (projectId: string) => {
  const session = await prisma.traceSession.findFirst({
    where: {
      projectId,
    },
    select: {
      id: true,
    },
  });

  return session !== null;
};
