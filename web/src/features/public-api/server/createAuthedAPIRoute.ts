import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodObject, type z } from "zod";
import * as Sentry from "@sentry/node";
import {
  verifyAuthHeaderAndReturnScope,
  type AuthHeaderValidVerificationResult,
} from "@/src/features/public-api/server/apiAuth";
import { ApiError } from "@langfuse/shared";

type RouteConfig<
  TQuery extends ZodObject<any>,
  TBody extends ZodObject<any>,
  TResponse extends ZodObject<any>,
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
  TQuery extends ZodObject<any>,
  TBody extends ZodObject<any>,
  TResponse extends ZodObject<any>,
>(
  routeConfig: RouteConfig<TQuery, TBody, TResponse>,
): ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const auth = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );
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
      try {
        routeConfig.responseSchema
          .strict() // fail on extra fields
          .parse(response);
      } catch (error: unknown) {
        console.error("Response validation failed:", error);
        Sentry.captureException(error);
        if (process.env.NODE_ENV !== "production")
          throw new ApiError("DEV: output validation failed"); // rethrow in when not in production
      }
    }

    res
      .status(routeConfig.successStatusCode || 200)
      .json(response || { message: "OK" });
  };
};
