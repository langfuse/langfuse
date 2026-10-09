vi.mock("@langfuse/shared/src/server", async () => ({
  ...(await vi.importActual("@langfuse/shared/src/server")),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  traceException: vi.fn(),
}));

import type { Session } from "next-auth";
import { TRPCError } from "@trpc/server";
import * as z from "zod";
import {
  ClickHouseResourceError,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { Prisma } from "@langfuse/shared/src/db";
import { getOriginalError } from "@/src/server/utils/trpc-utils";
import {
  createInnerTRPCContext,
  createTRPCRouter,
  protectedProcedureWithoutTracing,
} from "@/src/server/api/trpc";

describe("tRPC error formatting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ClickHouseResourceError", async () => {
    const session = {
      user: {
        id: "user-1",
      },
    } as Session;

    const formatterTestRouter = createTRPCRouter({
      clickhouse: protectedProcedureWithoutTracing
        .input(z.object({}))
        .query(() => {
          throw new ClickHouseResourceError(
            "MEMORY_LIMIT",
            new Error("Memory limit exceeded"),
          );
        }),
    });

    const formatter = (formatterTestRouter as any)._def._config
      .errorFormatter as (args: any) => {
      data: Record<string, unknown>;
    };

    const context = createInnerTRPCContext({
      session,
      headers: {},
    });
    const caller = formatterTestRouter.createCaller(context);

    let error: TRPCError | undefined;
    try {
      await caller.clickhouse({});
    } catch (caught) {
      error = caught as TRPCError;
    }

    expect(error).toBeInstanceOf(TRPCError);

    const formatted = formatter({
      shape: {
        code: -32603,
        message: error!.message,
        data: {
          code: error!.code,
          httpStatus: 422,
        },
      },
      error: error!,
    });

    expect(formatted.data["errorName"]).toBe("ClickHouseResourceError");
    expect(formatted.data["stack"]).toBeNull();
    expect(formatted.data["zodError"]).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "ClickHouse resource limit exceeded",
      expect.objectContaining({
        errorType: "MEMORY_LIMIT",
        message: "Memory limit exceeded",
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("preserves the default stack behavior for non-ClickHouse errors", () => {
    const formatterTestRouter = createTRPCRouter({});

    const formatter = (formatterTestRouter as any)._def._config
      .errorFormatter as (args: any) => {
      data: Record<string, unknown>;
    };

    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal error",
    });

    const formattedWithNoStack = formatter({
      shape: {
        code: -32603,
        message: error.message,
        data: {
          code: error.code,
          httpStatus: 500,
          stack: undefined,
        },
      },
      error,
    });

    expect(formattedWithNoStack.data["stack"]).toBeUndefined();

    const formattedWithStack = formatter({
      shape: {
        code: -32603,
        message: error.message,
        data: {
          code: error.code,
          httpStatus: 500,
          stack: "dev stack",
        },
      },
      error,
    });

    expect(formattedWithStack.data["stack"]).toBe("dev stack");
  });

  describe("5xx errors", () => {
    const callFailing = async (thrown: unknown) => {
      const router = createTRPCRouter({
        failing: protectedProcedureWithoutTracing.query(() => {
          throw thrown;
        }),
      });
      const caller = router.createCaller(
        createInnerTRPCContext({
          session: { user: { id: "user-1" } } as Session,
          headers: {},
        }),
      );
      try {
        await caller.failing();
      } catch (caught) {
        return caught as TRPCError;
      }
      throw new Error("expected the procedure to fail");
    };

    it.each([
      [
        "Prisma",
        new Prisma.PrismaClientKnownRequestError(
          "Unique constraint failed on the fields: (`id`)",
          { code: "P2002", clientVersion: "test" },
        ),
      ],
      ["generic", new Error("connection refused")],
    ])(
      "traces the %s cause on the span but returns a generic error",
      async (_, original) => {
        const error = await callFailing(original);

        expect(traceException).toHaveBeenCalledWith(original);
        expect(getOriginalError(error)).toBe(original);
        expect(error.code).toBe("INTERNAL_SERVER_ERROR");
        expect(error.message).toMatch(/^Internal error\. /);
        expect(error.cause).toBeUndefined();
        expect(JSON.stringify(error)).not.toContain(original.message);
      },
    );
  });

  it("keeps the message of a 4xx error and does not trace it", async () => {
    const router = createTRPCRouter({
      failing: protectedProcedureWithoutTracing.query(() => {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid filter" });
      }),
    });
    const caller = router.createCaller(
      createInnerTRPCContext({
        session: { user: { id: "user-1" } } as Session,
        headers: {},
      }),
    );

    await expect(caller.failing()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid filter",
    });
    expect(traceException).not.toHaveBeenCalled();
  });
});
