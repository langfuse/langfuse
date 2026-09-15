import { prisma } from "@langfuse/shared/src/db";
import {
  GetSessionsV1Query,
  GetSessionsV1Response,
} from "@/src/features/public-api/types/sessions";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { legacyPublicApiRateLimitUpgradePaths } from "@/src/features/public-api/server/rateLimitUpgradePaths";
import { SESSIONS_DEPRECATION } from "@/src/features/public-api/server/deprecations";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Sessions",
    action: "sessions:read",
    deprecation: SESSIONS_DEPRECATION,
    rateLimitResource: "public-api-legacy",
    querySchema: GetSessionsV1Query,
    responseSchema: GetSessionsV1Response,
    rateLimitUpgradePath: legacyPublicApiRateLimitUpgradePaths.sessionsList,
    rejectInEventsOnlyMode: true,
    fn: async ({ query, auth }) => {
      const { fromTimestamp, toTimestamp, limit, page, environment } = query;
      const dataAccessWindow = clampToDataAccessDays({
        plan: auth.scope.plan,
        fromTimestamp: fromTimestamp ?? undefined,
      });

      const where = {
        projectId: auth.scope.projectId,
        createdAt: {
          ...(dataAccessWindow.effectiveFromTimestamp && {
            gte: dataAccessWindow.effectiveFromTimestamp,
          }),
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
