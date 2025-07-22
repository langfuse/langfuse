import { queryClickhouse } from "@langfuse/shared/src/server";

// Simplified version that filters by allowed usernames on the database side
export const getTracesGroupedByAllowedUsers = async (
  projectId: string,
  allowedUsernames: string[],
) => {
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && allowedUsernames.length === 0) {
    return [];
  }

  const query = `
    SELECT
      user_id as user,
      count(*) as count
    FROM traces t
    WHERE t.project_id = {projectId: String}
    AND t.user_id IS NOT NULL
    AND t.user_id != ''
    ${!isDev ? "AND t.user_id IN {allowedUsernames: Array(String)}" : ""}
    GROUP BY user
    ORDER BY count DESC
  `;

  const rows = await queryClickhouse<{
    user: string;
    count: string;
  }>({
    query: query,
    params: {
      projectId,
      ...(isDev ? {} : { allowedUsernames }),
    },
    tags: {
      feature: "tracing",
      type: "trace",
      kind: "analytic",
      projectId,
    },
  });

  return rows;
};
