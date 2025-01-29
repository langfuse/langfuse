import { prisma } from "@langfuse/shared/src/db";
import {
  GetSessionsV1Query,
  GetSessionsV1Response,
} from "@/src/features/public-api/types/sessions";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Sessions",
    querySchema: GetSessionsV1Query,
    responseSchema: GetSessionsV1Response,
    fn: async ({ query, auth }) => {
      const { fromTimestamp, toTimestamp, limit, page } = query;

      const sessions = await prisma.traceSession.findMany({
        select: {
          id: true,
          createdAt: true,
          projectId: true,
        },
        where: {
          projectId: auth.scope.projectId,
          createdAt: {
            ...(fromTimestamp && { gte: new Date(fromTimestamp) }),
            ...(toTimestamp && { lt: new Date(toTimestamp) }),
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      });

      const totalItems = await prisma.traceSession.count({
        where: {
          projectId: auth.scope.projectId,
          createdAt: {
            ...(fromTimestamp && { gte: new Date(fromTimestamp) }),
            ...(toTimestamp && { lt: new Date(toTimestamp) }),
          },
        },
      });

      return {
        data: sessions,
        meta: {
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
          page,
          limit,
        },
      };
    },
  }),
});
