import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  GetUsersQuery,
  GetUsersResponse,
} from "@/src/features/public-api/types/users";

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
      return {
        users:users
      };
    },
  }),
});