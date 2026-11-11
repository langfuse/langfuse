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

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { ...actual, env: { ...actual.env } };
});

import type { Session } from "next-auth";
import { TRPCError } from "@trpc/server";
import * as z from "zod";
import {
  ClickHouseResourceError,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { Prisma } from "@langfuse/shared/src/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { reportTRPCError } from "@/src/server/utils/trpc-utils";
import {
  createInnerTRPCContext,
  createTRPCRouter,
  protectedProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";

const throwClickHouseMemoryError = async () => {
  const router = createTRPCRouter({
    clickhouse: protectedProcedureWithoutTracing
      .input(z.object({}))
      .query(() => {
        throw new ClickHouseResourceError(
          "MEMORY_LIMIT",
          new Error("Memory limit exceeded"),
        );
      }),
  });
  const caller = router.createCaller(
    createInnerTRPCContext({
      session: { user: { id: "user-1" } } as Session,
      headers: {},
    }),
  );
  try {
    await caller.clickhouse({});
  } catch (caught) {
    return caught as TRPCError;
  }
  throw new Error("expected the procedure to throw");
};

describe("tRPC error formatting", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined });
  });

  afterEach(() => {
    Object.assign(env, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: originalCloudRegion,
    });
  });

  it("ClickHouseResourceError", async () => {
    const error = await throwClickHouseMemoryError();
    const formatter = (createTRPCRouter({}) as any)._def._config
      .errorFormatter as (args: any) => {
      data: Record<string, unknown>;
    };

    expect(error).toBeInstanceOf(TRPCError);

    const formatted = formatter({
      shape: {
        code: -32603,
        message: error.message,
        data: {
          code: error.code,
          httpStatus: 422,
        },
      },
      error,
    });

    expect(formatted.data["errorName"]).toBe("ClickHouseResourceError");
    expect(formatted.data["clickhouseErrorType"]).toBe("MEMORY_LIMIT");
    expect(error.message).toContain("ClickHouse ran out of memory");
    expect(error.message).toContain(
      "langfuse.com/self-hosting/configuration/scaling",
    );
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

  it("omits the self-hosting link from memory errors on Langfuse Cloud", async () => {
    Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU" });

    const error = await throwClickHouseMemoryError();

    expect(error.message).toContain("ClickHouse ran out of memory");
    expect(error.message).not.toContain("self-hosting");
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

  describe("over HTTP", () => {
    const fetchFailing = (thrown: unknown) => {
      const router = createTRPCRouter({
        failing: protectedProcedureWithoutTracing.query(() => {
          throw thrown;
        }),
      });
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req: new Request("http://localhost/api/trpc/failing"),
        router,
        createContext: () =>
          createInnerTRPCContext({
            session: { user: { id: "user-1" } } as Session,
            headers: {},
          }),
        onError: reportTRPCError,
      });
    };

    it.each([
      [
        "Prisma",
        new Prisma.PrismaClientKnownRequestError(
          "Unique constraint failed on the fields: (`id`)",
          { code: "P2002", clientVersion: "test" },
        ),
      ],
      [
        "uncaused TRPCError",
        new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "connection refused",
        }),
      ],
    ])(
      "traces the %s cause on the span but returns a generic 5xx",
      async (_, original) => {
        const res = await fetchFailing(original);
        const body = await res.text();

        expect(res.status).toBe(500);
        expect(body).toContain("Internal error. ");
        expect(body).not.toContain(original.message);
        expect(traceException).toHaveBeenCalledTimes(1);
        expect(vi.mocked(traceException).mock.calls[0]?.[0]).toBe(original);
      },
    );

    it("keeps the message of a 4xx error and does not trace it", async () => {
      const res = await fetchFailing(
        new TRPCError({ code: "BAD_REQUEST", message: "Invalid filter" }),
      );

      expect(res.status).toBe(400);
      expect(await res.text()).toContain("Invalid filter");
      expect(traceException).not.toHaveBeenCalled();
    });
  });
});
