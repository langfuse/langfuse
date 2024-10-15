import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  GetUsersQuery,
  GetUsersResponse,
} from "@/src/features/public-api/types/users";
import { InternalServerError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Users",
    querySchema: GetUsersQuery,
    responseSchema: GetUsersResponse,
    fn: async ({ query, auth }) => {
      // Disallow negative page numbers
      const skipValue = Math.max((query.page - 1) * query.limit,0);
      // Get this page's users and total user count in parallel
       const [users, totalUsers] = await Promise.all([prisma.$queryRaw<
       Array<{
            userId: string;
            lastTrace:string;
          }>
        >`
          SELECT
            t.user_id AS "userId",
            MAX(t.timestamp) as "lastTrace"
          FROM
            traces t
          WHERE
            t.user_id IS NOT NULL
            AND t.user_id != ''
            AND t.project_id = ${auth.scope.projectId}
          GROUP BY
            t.user_id
          ORDER BY
            "lastTrace" DESC NULLS LAST
          LIMIT
            ${query.limit} OFFSET ${skipValue};
        `,
        prisma.$queryRaw<
          Array<{
            totalCount: bigint;
          }>
        >`
          SELECT COUNT(DISTINCT t.user_id) AS "totalCount"
          FROM traces t
          WHERE t.project_id = ${auth.scope.projectId}
        `
      ])
      if (totalUsers.length != 1){
        // If we are here something is seriously wrong
        throw new InternalServerError("Users not found");
      }

      return {
        data:users,
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: Number(totalUsers[0].totalCount),
          totalPages: Math.ceil(Number(totalUsers[0].totalCount)/ query.limit),
        }
      };
    },
  }),
});