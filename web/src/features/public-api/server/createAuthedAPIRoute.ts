import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType, ZodObject, type z } from "zod";
import * as Sentry from "@sentry/node";
import {
  verifyAuthHeaderAndReturnScope,
  type AuthHeaderValidVerificationResult,
} from "@/src/features/public-api/server/apiAuth";

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
      try {
        // If the response schema is an object, we need to call strict() to ensure that the response object doesn't have any extra keys
        const responseSchema = routeConfig.responseSchema;
        if (responseSchema instanceof ZodObject) {
          responseSchema.strict().parse(response);
        } else {
          responseSchema.parse(response);
        }
      } catch (error: unknown) {
        console.error("Response validation failed:", error);
        Sentry.captureException(error);
      }
    }

    res
      .status(routeConfig.successStatusCode || 200)
      .json(response || { message: "OK" });
  };
};
