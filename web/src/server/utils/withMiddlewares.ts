import { isPrismaException } from "@/src/utils/exceptions";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { BaseError, MethodNotAllowedError } from "@langfuse/shared";

const httpMethods = ["GET", "POST", "PUT", "DELETE"] as const;
type HttpMethod = (typeof httpMethods)[number];
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
        },
        ...handlers,
      };

      return await finalHandlers[method](req, res);
    } catch (error) {
      console.error(error);

      if (error instanceof BaseError) {
        return res.status(error.httpCode).json({
          message: error.message,
          error: error.name,
        });
      }

      if (isPrismaException(error)) {
        return res.status(500).json({
          message: "Internal Server Error",
          error: "An unknown error occurred",
        });
      }

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid request data",
          error: error.errors,
        });
      }

      return res.status(500).json({
        message: "Internal Server Error",
        error:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  };
}
