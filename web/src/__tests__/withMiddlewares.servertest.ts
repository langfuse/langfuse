/** @jest-environment node */
import type { NextApiRequest, NextApiResponse } from "next";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  BaseError,
  LangfuseNotFoundError,
  UnauthorizedError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import {
  ClickHouseResourceError,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { createMocks } from "node-mocks-http";
import { z } from "zod/v4";
import { Prisma } from "@prisma/client";

// Mock the logger and traceException
jest.mock("@langfuse/shared/src/server", () => ({
  ...jest.requireActual("@langfuse/shared/src/server"),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  traceException: jest.fn(),
}));

describe("withMiddlewares error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("BaseError handling", () => {
    it("should handle BaseError with 4xx status code", async () => {
      const error = new BaseError("BadRequest", 400, "Bad Request", false);

      const handler = withMiddlewares({
        POST: async () => {
          throw error;
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Bad Request",
        error: "BadRequest",
      });
    });

    it("should handle BaseError with 5xx status code and trace exception", async () => {
      const error = new BaseError(
        "ServiceUnavailable",
        503,
        "Internal Error",
        true,
      );

      const handler = withMiddlewares({
        GET: async () => {
          throw error;
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(503);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Internal Error",
        error: "ServiceUnavailable",
      });
      // Should trace 5xx errors
      expect(traceException).toHaveBeenCalledWith(error);
    });
  });

  describe("LangfuseNotFoundError handling", () => {
    it("should handle LangfuseNotFoundError and log as info", async () => {
      const error = new LangfuseNotFoundError("Resource not found");

      const handler = withMiddlewares({
        GET: async () => {
          throw error;
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Resource not found",
        error: "LangfuseNotFoundError",
      });
      // Should log as info, not error
      expect(logger.info).toHaveBeenCalledWith(error);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("UnauthorizedError handling", () => {
    it("should handle UnauthorizedError and log as info", async () => {
      const error = new UnauthorizedError("Invalid credentials");

      const handler = withMiddlewares({
        POST: async () => {
          throw error;
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Invalid credentials",
        error: "UnauthorizedError",
      });
      // Should log as info, not error
      expect(logger.info).toHaveBeenCalledWith(error);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("MethodNotAllowedError handling", () => {
    it("should throw MethodNotAllowedError for unsupported methods", async () => {
      const handler = withMiddlewares({
        GET: async () => {},
        // POST is not defined
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Method not allowed",
        error: "MethodNotAllowedError",
      });
    });
  });

  describe("ClickHouseResourceError handling", () => {
    it("should handle ClickHouseResourceError with 422 status", async () => {
      const originalError = new Error("Memory limit exceeded: maximum: 10GB");
      const resourceError = new ClickHouseResourceError(
        "MEMORY_LIMIT",
        originalError,
      );

      const handler = withMiddlewares({
        POST: async () => {
          throw resourceError;
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(422);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData["message"]).toBeDefined();
      expect(jsonData["message"]).toContain(
        ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
      );
      expect(jsonData["error"]).toBe("Unprocessable Content");
    });
  });

  describe("Prisma exception handling", () => {
    it("should handle Prisma exceptions with generic 500 error", async () => {
      // Create a real Prisma error
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "5.0.0" },
      );

      const handler = withMiddlewares({
        POST: async () => {
          throw prismaError;
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Internal Server Error",
        error: "An unknown error occurred",
      });

      expect(traceException).toHaveBeenCalledWith(prismaError);
    });
  });

  describe("Zod validation error handling", () => {
    it("should handle Zod validation errors with 400 status", async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const handler = withMiddlewares({
        POST: async () => {
          // This will throw a ZodError
          schema.parse({ name: "John", age: "not a number" });
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Invalid request data",
        error: expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_type",
            path: ["age"],
          }),
        ]),
      });
    });
  });

  describe("ServiceUnavailableError handling", () => {
    it("should handle ServiceUnavailableError with 503 status", async () => {
      const error = new ServiceUnavailableError(
        "Storage service temporarily unavailable due to network issues",
      );

      const handler = withMiddlewares({
        POST: async () => {
          throw error;
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(503);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message:
          "Storage service temporarily unavailable due to network issues",
        error: "ServiceUnavailableError",
      });
      // Should trace 5xx errors
      expect(traceException).toHaveBeenCalledWith(error);
    });
  });

  describe("Generic error handling", () => {
    it("should handle generic Error instances with 500 status", async () => {
      const error = new Error("Something went wrong");

      const handler = withMiddlewares({
        DELETE: async () => {
          throw error;
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Internal Server Error",
        error: "Something went wrong",
      });

      expect(traceException).toHaveBeenCalledWith(error);
    });

    it("should handle non-Error thrown values with 500 status", async () => {
      const handler = withMiddlewares({
        PATCH: async () => {
          throw "string error";
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Internal Server Error",
        error: "An unknown error occurred",
      });
    });

    it("should handle null/undefined errors with 500 status", async () => {
      const handler = withMiddlewares({
        PUT: async () => {
          throw null;
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
        headers: {
          "x-langfuse-public-key": "test-key",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData).toMatchObject({
        message: "Internal Server Error",
        error: "An unknown error occurred",
      });
    });
  });
});
