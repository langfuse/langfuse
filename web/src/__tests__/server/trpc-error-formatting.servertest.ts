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

const throwClickHouseResourceError = async (message: string) => {
  const router = createTRPCRouter({
    clickhouse: protectedProcedureWithoutTracing
      .input(z.object({}))
      .query(() => {
        throw ClickHouseResourceError.wrapIfResourceError(new Error(message));
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

const formatClickHouseError = (error: TRPCError) => {
  const formatter = (createTRPCRouter({}) as any)._def._config
    .errorFormatter as (args: any) => {
    data: Record<string, unknown>;
  };
  return formatter({
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
};

const GENERIC_ADVICE =
  /^Your query could not be completed\..*narrow your request/;
const MEMORY_ADVICE = /^ClickHouse ran out of memory.*narrow your request/;
const RESULT_SIZE_ADVICE = /result is too large.*date range.*filters/i;

const clickHouseErrorCases = [
  {
    errorType: "MEMORY_LIMIT",
    message: "Memory limit exceeded",
    adviceByDefault: GENERIC_ADVICE,
    adviceWhenDetailed: MEMORY_ADVICE,
  },
  {
    errorType: "OVERCOMMIT",
    message:
      "Memory limit (total) exceeded. OvercommitTracker decision: Query was selected to stop by OvercommitTracker",
    adviceByDefault: GENERIC_ADVICE,
    adviceWhenDetailed: MEMORY_ADVICE,
  },
  {
    errorType: "RESULT_SIZE",
    message:
      "Limit for result exceeded, max bytes: 10.00 MiB. (TOO_MANY_ROWS_OR_BYTES) SELECT private_column FROM private_table",
    adviceByDefault: RESULT_SIZE_ADVICE,
    adviceWhenDetailed: RESULT_SIZE_ADVICE,
  },
  {
    errorType: "TIMEOUT",
    message: "Request timed out after 30000ms",
    adviceByDefault: GENERIC_ADVICE,
    adviceWhenDetailed: GENERIC_ADVICE,
  },
];

describe("tRPC error formatting", () => {
  const originalDetailedErrors = env.LANGFUSE_SHOW_DETAILED_CLICKHOUSE_ERRORS;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.assign(env, {
      LANGFUSE_SHOW_DETAILED_CLICKHOUSE_ERRORS: originalDetailedErrors,
    });
  });

  it.each(clickHouseErrorCases)(
    "ClickHouseResourceError $errorType hides the error type by default",
    async ({ errorType, message, adviceByDefault }) => {
      Object.assign(env, { LANGFUSE_SHOW_DETAILED_CLICKHOUSE_ERRORS: "false" });

      const error = await throwClickHouseResourceError(message);
      const formatted = formatClickHouseError(error);

      expect(error).toBeInstanceOf(TRPCError);
      expect(error.code).toBe("UNPROCESSABLE_CONTENT");
      expect(error.message).not.toContain(message);
      expect(error.message).toMatch(adviceByDefault);
      expect(error.message).not.toMatch(/memory/i);

      expect(formatted.data["errorName"]).toBe("ClickHouseResourceError");
      expect(formatted.data).not.toHaveProperty("clickhouseErrorType");
      expect(formatted.data["stack"]).toBeNull();
      expect(formatted.data["zodError"]).toBeNull();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        "ClickHouse resource limit exceeded",
        expect.objectContaining({
          errorType,
          message,
        }),
      );
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each(clickHouseErrorCases)(
    "ClickHouseResourceError $errorType exposes the error type when LANGFUSE_SHOW_DETAILED_CLICKHOUSE_ERRORS is on",
    async ({ errorType, message, adviceWhenDetailed }) => {
      Object.assign(env, { LANGFUSE_SHOW_DETAILED_CLICKHOUSE_ERRORS: "true" });

      const error = await throwClickHouseResourceError(message);
      const formatted = formatClickHouseError(error);

      expect(error.code).toBe("UNPROCESSABLE_CONTENT");
      expect(error.message).not.toContain(message);
      expect(error.message).toMatch(adviceWhenDetailed);
      expect(error.message).not.toMatch(/https?:\/\//);

      expect(formatted.data["errorName"]).toBe("ClickHouseResourceError");
      expect(formatted.data["clickhouseErrorType"]).toBe(errorType);
      expect(formatted.data["stack"]).toBeNull();
    },
  );

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
