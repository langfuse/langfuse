import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType, type z } from "zod";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { prisma } from "@langfuse/shared/src/db";
import {
  redis,
  type AuthHeaderValidVerificationResult,
  traceException,
} from "@langfuse/shared/src/server";

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
  fn: (params: {
    query: z.infer<TQuery>;
    body: z.infer<TBody>;
    req: NextApiRequest;
    res: NextApiResponse;
    auth: AuthHeaderValidVerificationResult;
  }) => Promise<z.infer<TResponse>>;
};

export const createAuthedAPIRoute = <
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
    if (auth.scope.accessLevel !== "all") {
      res.status(401).json({
        message: "Access denied - need to use basic auth with secret key",
      });
      return;
    }

    console.log(
      "Request to route ",
      routeConfig.name,
      "projectId ",
      auth.scope.projectId,
      "with query ",
      req.query,
      "and body ",
      req.body,
    );

    const query = routeConfig.querySchema
      ? routeConfig.querySchema.parse(req.query)
      : {};
    const body = routeConfig.bodySchema
      ? routeConfig.bodySchema.parse(req.body)
      : {};

    const response = await routeConfig.fn({
      query,
      body,
      req,
      res,
      auth,
    });

    if (routeConfig.responseSchema) {
      const parsingResult = routeConfig.responseSchema.safeParse(response);
      if (!parsingResult.success) {
        console.error("Response validation failed:", parsingResult.error);
        traceException(parsingResult.error);
      }
    }

    res
      .status(routeConfig.successStatusCode || 200)
      .json(response || { message: "OK" });
  };
};
