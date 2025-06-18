import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType, type z } from "zod/v4";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { prisma } from "@langfuse/shared/src/db";
import {
  redis,
  type AuthHeaderValidVerificationResult,
  traceException,
  logger,
} from "@langfuse/shared/src/server";
import { type RateLimitResource } from "@langfuse/shared";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { contextWithLangfuseProps } from "@langfuse/shared/src/server";
import * as opentelemetry from "@opentelemetry/api";
import { env } from "@/src/env.mjs";

type RouteConfig<
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
> = {
  name: string;
  querySchema?: TQuery;
  bodySchema?: TBody;
  responseSchema: TResponse;
  successStatusCode?: number;
  rateLimitResource?: z.infer<typeof RateLimitResource>; // defaults to public-api
  fn: (params: {
    query: z.infer<TQuery>;
    body: z.infer<TBody>;
    req: NextApiRequest;
    res: NextApiResponse;
    auth: AuthHeaderValidVerificationResult & {
      scope: { projectId: string; accessLevel: "project" };
    };
  }) => Promise<z.infer<TResponse>>;
};

export const createAuthedProjectAPIRoute = <
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
>(
  routeConfig: RouteConfig<TQuery, TBody, TResponse>,
): ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const auth = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
    if (!auth.validKey) {
      res.status(401).json({ message: auth.error });
      return;
    }
    if (auth.scope.accessLevel !== "project") {
      res.status(401).json({
        message: "Access denied - need to use basic auth with secret key",
      });
      return;
    }
    if (!auth.scope.projectId) {
      res.status(401).json({
        message:
          "Project ID not found for API token. Are you using an organization key?",
      });
      return;
    }

    const rateLimitResponse =
      await RateLimitService.getInstance().rateLimitRequest(
        auth.scope,
        routeConfig.rateLimitResource || "public-api",
      );

    if (rateLimitResponse?.isRateLimited()) {
      return rateLimitResponse.sendRestResponseIfLimited(res);
    }

    logger.debug(
      `Request to route ${routeConfig.name} projectId ${auth.scope.projectId}`,
      {
        query: req.query,
        body: req.body,
      },
    );

    const query = routeConfig.querySchema
      ? routeConfig.querySchema.parse(req.query)
      : ({} as z.infer<TQuery>);
    const body = routeConfig.bodySchema
      ? routeConfig.bodySchema.parse(req.body)
      : ({} as z.infer<TBody>);

    const ctx = contextWithLangfuseProps({
      headers: req.headers,
      projectId: auth.scope.projectId,
    });
    return opentelemetry.context.with(ctx, async () => {
      const response = await routeConfig.fn({
        query,
        body,
        req,
        res,
        auth: auth as AuthHeaderValidVerificationResult & {
          scope: { projectId: string; accessLevel: "project" };
        },
      });

      if (env.NODE_ENV === "development" && routeConfig.responseSchema) {
        const parsingResult = routeConfig.responseSchema.safeParse(response);
        if (!parsingResult.success) {
          logger.error("Response validation failed:", parsingResult.error);
          traceException(parsingResult.error);
        }
      }

      res
        .status(routeConfig.successStatusCode || 200)
        .json(response || { message: "OK" });
    });
  };
};
