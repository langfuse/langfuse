import { prisma } from "@langfuse/shared/src/db";
import {
  GetSessionsV1Query,
  GetSessionsV1Response,
} from "@/src/features/public-api/types/sessions";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Sessions",
    querySchema: GetSessionsV1Query,
    responseSchema: GetSessionsV1Response,
    fn: async ({ query, auth }) => {
      const { fromTimestamp, toTimestamp, limit, page, environment } = query;

      const where = {
        projectId: auth.scope.projectId,
        createdAt: {
          ...(fromTimestamp && { gte: new Date(fromTimestamp) }),
          ...(toTimestamp && { lt: new Date(toTimestamp) }),
        },
        environment: environment
          ? Array.isArray(environment)
            ? { in: environment }
            : environment
          : undefined,
      };

      const [sessions, totalItems] = await Promise.all([
        prisma.traceSession.findMany({
          select: {
            id: true,
            createdAt: true,
            projectId: true,
            environment: true,
          },
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: (page - 1) * limit,
        }),
        prisma.traceSession.count({ where }),
      ]);

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
