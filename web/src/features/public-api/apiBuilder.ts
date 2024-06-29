import { type NextApiRequest, type NextApiResponse } from "next";
import { z, type ZodSchema } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import {
  verifyAuthHeaderAndReturnScope,
  type AuthHeaderValidVerificationResult,
} from "@/src/features/public-api/server/apiAuth";
import { isPrismaException } from "@/src/utils/exceptions";
import * as Sentry from "@sentry/node";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type RouteConfig<
  TQuery extends ZodSchema<any>,
  TBody extends ZodSchema<any>,
  TResponse extends ZodSchema<any>,
> = {
  method: HttpMethod;
  name: string;
  querySchema?: TQuery;
  bodySchema?: TBody;
  responseSchema: TResponse;
  successStatus?: number;
  fn: (params: {
    query: z.infer<TQuery>;
    body: z.infer<TBody>;
    req: NextApiRequest;
    res: NextApiResponse;
    auth: AuthHeaderValidVerificationResult;
  }) => Promise<z.infer<TResponse>>;
};

export const createAPIRoute = <
  TQuery extends ZodSchema<any>,
  TBody extends ZodSchema<any>,
  TResponse extends ZodSchema<any>,
>(
  routeConfig: RouteConfig<TQuery, TBody, TResponse>,
) => {
  return routeConfig;
};

export const ApiHandler = (routeConfigs: RouteConfig<any, any, any>[]) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    await runMiddleware(req, res, cors);

    const method = req.method as HttpMethod;
    const routeConfig = routeConfigs.find((config) => config.method === method);

    if (!routeConfig) {
      res.status(405).json({ message: "Method not allowed" });
      return;
    }

    try {
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
          routeConfig.responseSchema.parse(response);
        } catch (error: unknown) {
          console.error("Response validation failed:", error);
          Sentry.captureException(error);
          if (process.env.NODE_ENV !== "production") throw error; // rethrow in dev mode
        }
      }

      res
        .status(routeConfig.successStatus || 200)
        .json(response || { message: "OK" });
    } catch (error: unknown) {
      console.error(`Error in route "${routeConfig.name}":`, error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          message: "Invalid request data",
          error: error.errors,
        });
        return;
      }

      if (isPrismaException(error)) {
        res.status(500).json({
          error: "Internal Server Error",
        });
        return;
      }

      res.status(500).json({
        error: "Internal Server Error",
      });
    }
  };
};
