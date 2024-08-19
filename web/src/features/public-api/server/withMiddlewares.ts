import { isPrismaException } from "@/src/utils/exceptions";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodError } from "zod";
import { BaseError, MethodNotAllowedError } from "@langfuse/shared";
import { traceException } from "@langfuse/shared/src/server";

const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export type HttpMethod = (typeof httpMethods)[number];
type Handlers = {
  [Method in HttpMethod]?: (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => Promise<void>;
};

const defaultHandler = () => {
  throw new MethodNotAllowedError();
};

export function withMiddlewares(handlers: Handlers) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await runMiddleware(req, res, cors);

      const method = req.method as HttpMethod;
      if (!handlers[method]) throw new MethodNotAllowedError();

      const finalHandlers: Required<Handlers> = {
        ...{
          GET: defaultHandler,
          POST: defaultHandler,
          PUT: defaultHandler,
          DELETE: defaultHandler,
          PATCH: defaultHandler,
        },
        ...handlers,
      };

      return await finalHandlers[method](req, res);
    } catch (error) {
      console.error(error);

      if (error instanceof BaseError) {
        if (error.httpCode >= 500 && error.httpCode < 600) {
          traceException(error);
        }
        return res.status(error.httpCode).json({
          message: error.message,
          error: error.name,
        });
      }

      if (isPrismaException(error)) {
        traceException(error);
        return res.status(500).json({
          message: "Internal Server Error",
          error: "An unknown error occurred",
        });
      }

      // Instanceof check fails here as shared package zod has different instances
      if (isZodError(error)) {
        return res.status(400).json({
          message: "Invalid request data",
          error: error.errors,
        });
      }

      traceException(error);
      return res.status(500).json({
        message: "Internal Server Error",
        error:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  };
}

export function isZodError(error: any): error is ZodError {
  return error instanceof Object && error.constructor.name === "ZodError";
}
