/** @jest-environment node */

// Mock queue operations to avoid Redis dependency in tests
jest.mock("@langfuse/shared/src/server", () => {
  const actual = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...actual,
    // Mock queue getInstance to return a no-op queue
    EventPropagationQueue: {
      getInstance: () => ({
        add: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      }),
    },
  };
});

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod/v4";
import { z } from "zod/v4";
import {
  formatErrorForUser,
  wrapErrorHandling,
} from "@/src/features/mcp/core/error-formatting";
import { UserInputError, ApiServerError } from "@/src/features/mcp/core/errors";
import {
  UnauthorizedError,
  ForbiddenError,
  LangfuseNotFoundError,
  InvalidRequestError,
  BaseError,
} from "@langfuse/shared";

describe("MCP Error Formatting", () => {
  describe("formatErrorForUser", () => {
    describe("UserInputError handling", () => {
      it("should format UserInputError as InvalidRequest", () => {
        const error = new UserInputError("Prompt 'foo' not found");
        const mcpError = formatErrorForUser(error);

        expect(mcpError).toBeInstanceOf(McpError);
        expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
        expect(mcpError.message).toContain("Prompt 'foo' not found");
      });

      it("should preserve UserInputError message exactly", () => {
        const error = new UserInputError(
          "Cannot specify both label and version",
        );
        const mcpError = formatErrorForUser(error);

        expect(mcpError.message).toContain(
          "Cannot specify both label and version",
        );
      });

      it("should handle UserInputError with special characters", () => {
        const error = new UserInputError("Invalid name: special!@#$%^&*()");
        const mcpError = formatErrorForUser(error);

        expect(mcpError.message).toContain("Invalid name: special!@#$%^&*()");
      });
    });

    describe("ApiServerError handling", () => {
      it("should format ApiServerError as InternalError with generic message", () => {
        const error = new ApiServerError("Database connection failed");
        const mcpError = formatErrorForUser(error);

        expect(mcpError).toBeInstanceOf(McpError);
        expect(mcpError.code).toBe(ErrorCode.InternalError);
        // Should NOT expose internal error message
        expect(mcpError.message).toContain(
          "An internal server error occurred.",
        );
        expect(mcpError.message).not.toContain("Database");
      });

      it("should hide sensitive information in ApiServerError", () => {
        const error = new ApiServerError(
          "Redis connection to redis://password:secret@host:6379 failed",
        );
        const mcpError = formatErrorForUser(error);

        expect(mcpError.message).not.toContain("password");
        expect(mcpError.message).not.toContain("secret");
        expect(mcpError.message).not.toContain("redis://");
      });

      it("should handle ApiServerError with cause", () => {
        const cause = new Error("Network timeout");
        const error = new ApiServerError("Service unavailable", { cause });
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InternalError);
        expect(mcpError.message).not.toContain("Network timeout");
      });
    });

    describe("ZodError handling", () => {
      it("should format ZodError as InvalidParams", () => {
        const schema = z.object({
          name: z.string(),
          version: z.number(),
        });

        let zodError: ZodError | undefined;
        try {
          schema.parse({ name: 123, version: "not a number" });
        } catch (e) {
          if (e instanceof ZodError) {
            zodError = e;
          }
        }

        expect(zodError).toBeDefined();
        const mcpError = formatErrorForUser(zodError!);

        expect(mcpError.code).toBe(ErrorCode.InvalidParams);
        expect(mcpError.message).toContain("Validation failed");
      });

      it("should include field paths in validation error message", () => {
        const schema = z.object({
          name: z.string(),
          config: z.object({
            temperature: z.number().min(0).max(1),
          }),
        });

        let zodError: ZodError | undefined;
        try {
          schema.parse({ name: "test", config: { temperature: 2 } });
        } catch (e) {
          if (e instanceof ZodError) {
            zodError = e;
          }
        }

        const mcpError = formatErrorForUser(zodError!);

        expect(mcpError.message).toContain("config.temperature");
      });

      it("should format multiple validation errors", () => {
        const schema = z.object({
          name: z.string().min(1),
          version: z.number().positive(),
          labels: z.array(z.string()),
        });

        let zodError: ZodError | undefined;
        try {
          schema.parse({ name: "", version: -1, labels: "not an array" });
        } catch (e) {
          if (e instanceof ZodError) {
            zodError = e;
          }
        }

        const mcpError = formatErrorForUser(zodError!);

        expect(mcpError.message).toContain("Validation failed");
        // Should mention multiple issues
        expect(mcpError.message.split(",").length).toBeGreaterThanOrEqual(2);
      });
    });

    describe("Langfuse standard errors", () => {
      it("should format UnauthorizedError with auth message", () => {
        const error = new UnauthorizedError("Invalid API key");
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
        expect(mcpError.message).toContain("Authentication failed");
        expect(mcpError.message).toContain("API key");
      });

      it("should format ForbiddenError with permission message", () => {
        const error = new ForbiddenError("Access denied");
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
        expect(mcpError.message).toContain("forbidden");
        expect(mcpError.message).toContain("permission");
      });

      it("should format LangfuseNotFoundError with original message", () => {
        const error = new LangfuseNotFoundError("Prompt not found: chatbot");
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
        expect(mcpError.message).toContain("Prompt not found: chatbot");
      });

      it("should format InvalidRequestError with original message", () => {
        const error = new InvalidRequestError(
          "Cannot delete prompt with dependencies",
        );
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
        expect(mcpError.message).toContain(
          "Cannot delete prompt with dependencies",
        );
      });

      it("should format BaseError as InvalidRequest", () => {
        const error = new BaseError(
          "Generic base error",
          500,
          "Generic base error",
          true,
        );
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
        // BaseError is a base class - message handling may vary
        expect(mcpError).toBeInstanceOf(McpError);
      });
    });

    describe("Generic errors", () => {
      it("should format generic Error as InternalError", () => {
        const error = new Error("Something went wrong");
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InternalError);
        expect(mcpError.message).toContain("An unexpected error occurred.");
      });

      it("should hide implementation details from generic Error", () => {
        const error = new Error(
          "TypeError: Cannot read property 'foo' of undefined",
        );
        const mcpError = formatErrorForUser(error);

        expect(mcpError.message).not.toContain("TypeError");
        expect(mcpError.message).not.toContain("property");
        expect(mcpError.message).not.toContain("undefined");
      });

      it("should handle TypeError", () => {
        const error = new TypeError("Invalid type");
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InternalError);
      });

      it("should handle RangeError", () => {
        const error = new RangeError("Index out of bounds");
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InternalError);
      });
    });

    describe("Unknown error types", () => {
      it("should handle string thrown as error", () => {
        const error = "Something went wrong";
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InternalError);
        expect(mcpError.message).toContain("An unexpected error occurred.");
      });

      it("should handle number thrown as error", () => {
        const error = 404;
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InternalError);
      });

      it("should handle null thrown as error", () => {
        const error = null;
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InternalError);
      });

      it("should handle undefined thrown as error", () => {
        const error = undefined;
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InternalError);
      });

      it("should handle object thrown as error", () => {
        const error = { code: "ERR_CUSTOM", message: "Custom error" };
        const mcpError = formatErrorForUser(error);

        expect(mcpError.code).toBe(ErrorCode.InternalError);
      });
    });
  });

  describe("wrapErrorHandling", () => {
    it("should pass through successful function result", async () => {
      const fn = async () => ({ result: "success" });
      const wrapped = wrapErrorHandling(fn);

      const result = await wrapped();
      expect(result).toEqual({ result: "success" });
    });

    it("should pass through function arguments", async () => {
      const fn = async (a: number, b: string) => `${a}-${b}`;
      const wrapped = wrapErrorHandling(fn);

      const result = await wrapped(42, "test");
      expect(result).toBe("42-test");
    });

    it("should wrap UserInputError in McpError", async () => {
      const fn = async () => {
        throw new UserInputError("Invalid input");
      };
      const wrapped = wrapErrorHandling(fn);

      await expect(wrapped()).rejects.toThrow(McpError);
      try {
        await wrapped();
      } catch (e) {
        const mcpError = e as McpError;
        expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
        expect(mcpError.message).toContain("Invalid input");
      }
    });

    it("should wrap ApiServerError in McpError with generic message", async () => {
      const fn = async () => {
        throw new ApiServerError("Database crashed");
      };
      const wrapped = wrapErrorHandling(fn);

      await expect(wrapped()).rejects.toThrow(McpError);
      await expect(wrapped()).rejects.toMatchObject({
        code: ErrorCode.InternalError,
      });
    });

    it("should wrap ZodError in McpError", async () => {
      const schema = z.object({ name: z.string() });
      const fn = async () => {
        schema.parse({ name: 123 });
      };
      const wrapped = wrapErrorHandling(fn);

      await expect(wrapped()).rejects.toThrow(McpError);
      await expect(wrapped()).rejects.toMatchObject({
        code: ErrorCode.InvalidParams,
      });
    });

    it("should wrap generic Error in McpError", async () => {
      const fn = async () => {
        throw new Error("Unexpected error");
      };
      const wrapped = wrapErrorHandling(fn);

      await expect(wrapped()).rejects.toThrow(McpError);
      await expect(wrapped()).rejects.toMatchObject({
        code: ErrorCode.InternalError,
      });
    });

    it("should handle async function that returns promise", async () => {
      const fn = () => Promise.resolve({ data: "async result" });
      const wrapped = wrapErrorHandling(fn);

      const result = await wrapped();
      expect(result).toEqual({ data: "async result" });
    });

    it("should handle rejected promise", async () => {
      const fn = () => Promise.reject(new UserInputError("Async rejection"));
      const wrapped = wrapErrorHandling(fn);

      try {
        await wrapped();
      } catch (e) {
        const mcpError = e as McpError;
        expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
        expect(mcpError.message).toContain("Async rejection");
      }
    });

    it("should preserve function return type", async () => {
      interface PromptResult {
        id: string;
        name: string;
        version: number;
      }

      const fn = async (): Promise<PromptResult> => ({
        id: "123",
        name: "test",
        version: 1,
      });
      const wrapped = wrapErrorHandling(fn);

      const result = await wrapped();
      expect(result.id).toBe("123");
      expect(result.name).toBe("test");
      expect(result.version).toBe(1);
    });
  });

  describe("Error priority and categorization", () => {
    it("should categorize user-fixable errors as InvalidRequest", () => {
      const userErrors = [
        new UserInputError("Invalid input"),
        new LangfuseNotFoundError("Not found"),
        new InvalidRequestError("Bad request"),
      ];

      for (const error of userErrors) {
        const mcpError = formatErrorForUser(error);
        expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      }
    });

    it("should categorize server errors as InternalError", () => {
      const serverErrors = [
        new ApiServerError("Database down"),
        new Error("Generic error"),
        new TypeError("Type error"),
      ];

      for (const error of serverErrors) {
        const mcpError = formatErrorForUser(error);
        expect(mcpError.code).toBe(ErrorCode.InternalError);
      }
    });

    it("should categorize validation errors as InvalidParams", () => {
      const schema = z.object({ test: z.string() });
      let zodError: ZodError | undefined;
      try {
        schema.parse({ test: 123 });
      } catch (e) {
        if (e instanceof ZodError) {
          zodError = e;
        }
      }

      const mcpError = formatErrorForUser(zodError!);
      expect(mcpError.code).toBe(ErrorCode.InvalidParams);
    });
  });
});
