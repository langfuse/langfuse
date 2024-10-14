import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  GetUsersQuery,
  GetUsersResponse,
} from "@/src/features/public-api/types/users";
import { prism } from "react-syntax-highlighter/dist/esm/styles/prism";
import { groupBy } from "lodash";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Users",
    querySchema: GetUsersQuery,
    responseSchema: GetUsersResponse,
    fn: async ({ query, auth }) => {
      console.log(query.page)
      const skipValue = (query.page - 1) * query.limit;
      await prisma.account.findMany()
       const users = await prisma.$queryRaw<
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
        `
      const totalUsers = await prisma.$queryRaw<
          Array<{
            totalCount: bigint;
          }>
        >`
          SELECT COUNT(DISTINCT t.user_id) AS "totalCount"
          FROM traces t
          WHERE t.project_id = ${auth.scope.projectId}
        `
      console.log(totalUsers[0].totalCount)
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