// @vitest-environment node

import {
  httpBatchLink,
  httpLink,
  TRPCClientError,
  type TRPCLink,
} from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { vi } from "vitest";
import {
  fetchWithParseErrorStatus,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";
import { trpcCorrelationTags } from "@/src/utils/trpcCorrelation";

const { captureExceptionMock, addBreadcrumbMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  addBreadcrumbMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  addBreadcrumb: addBreadcrumbMock,
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const OTHER_TRACE_ID = "fedcba9876543210fedcba9876543210";
const REQUEST_ID = "11111111-2222-4333-8444-555555555555";

const ERROR_ENVELOPE = {
  error: {
    message: "boom",
    code: -32603,
    data: {
      code: "INTERNAL_SERVER_ERROR",
      httpStatus: 500,
      path: "projects.create",
    },
  },
};

const op = {
  id: 1,
  type: "mutation" as const,
  path: "projects.create",
  input: { name: "x" },
  context: {},
  signal: undefined,
};

const stubFetch = (
  body: string,
  status: number,
  headers: Record<string, string> = {},
) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(body, {
          status,
          headers: {
            "content-type":
              status === 500 ? "application/json" : "text/html; charset=utf-8",
            ...headers,
          },
        }),
    ),
  );
};

const correlationHeaders = {
  "x-request-id": REQUEST_ID,
  "x-dd-trace-id": TRACE_ID,
  "x-build-id": "build-1",
};

async function errorFromLink(link: TRPCLink<AnyRouter>): Promise<unknown> {
  const run = link({} as never);
  return new Promise((resolve, reject) => {
    run({
      op,
      next() {
        throw new Error("http link is terminal");
      },
    }).subscribe({
      next() {
        reject(new Error("expected the link to fail"));
      },
      error(error) {
        resolve(error);
      },
      complete() {
        reject(new Error("expected the link to fail"));
      },
    });
  });
}

const jsonLink = () =>
  httpLink({
    url: "http://localhost/api/trpc",
    fetch: fetchWithParseErrorStatus,
  });

const batchLink = () =>
  httpBatchLink({
    url: "http://localhost/api/trpc",
    fetch: fetchWithParseErrorStatus,
  });

describe("tRPC correlation tags", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("attaches response headers from a non-batched JSON error", async () => {
    stubFetch(JSON.stringify(ERROR_ENVELOPE), 500, correlationHeaders);

    const error = await errorFromLink(jsonLink());
    reportTrpcErrorWithoutToast(error, "projects");

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags).toMatchObject({
      area: "trpc",
      request_id: REQUEST_ID,
      "dd.trace_id": TRACE_ID,
    });
  });

  it("attaches response headers from a batched JSON error", async () => {
    stubFetch(JSON.stringify([ERROR_ENVELOPE]), 500, correlationHeaders);

    const error = await errorFromLink(batchLink());
    reportTrpcErrorWithoutToast(error, "projects");

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags).toMatchObject({
      request_id: REQUEST_ID,
      "dd.trace_id": TRACE_ID,
    });
  });

  it("puts the ids on the parse-error breadcrumb for a non-batched HTML body", async () => {
    stubFetch("<html>bad gateway</html>", 502, correlationHeaders);

    const error = await errorFromLink(jsonLink());
    reportTrpcErrorWithoutToast(error, "projects");

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    expect(addBreadcrumbMock.mock.calls[0]![0].data).toMatchObject({
      request_id: REQUEST_ID,
      "dd.trace_id": TRACE_ID,
      status: 502,
    });
  });

  it("puts the ids on the parse-error breadcrumb for a batched HTML body", async () => {
    stubFetch("<html>bad gateway</html>", 502, correlationHeaders);

    const error = await errorFromLink(batchLink());
    reportTrpcErrorWithoutToast(error, "projects");

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock.mock.calls[0]![0].data).toMatchObject({
      request_id: REQUEST_ID,
      "dd.trace_id": TRACE_ID,
    });
  });

  it("still captures a JSON error that has no correlation headers", async () => {
    stubFetch(JSON.stringify(ERROR_ENVELOPE), 500);

    const error = await errorFromLink(jsonLink());
    reportTrpcErrorWithoutToast(error, "projects");

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags.request_id).toBeUndefined();
    expect(options.tags["dd.trace_id"]).toBeUndefined();
  });

  it("does not copy an unsafe request id or a non-trace header onto Sentry", async () => {
    stubFetch(JSON.stringify(ERROR_ENVELOPE), 500, {
      "x-request-id": "person@example.com",
      "x-dd-trace-id": "not-a-trace",
    });

    const error = await errorFromLink(jsonLink());
    reportTrpcErrorWithoutToast(error, "projects");

    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags.request_id).toBeUndefined();
    expect(options.tags["dd.trace_id"]).toBeUndefined();
    expect(JSON.stringify(options.tags)).not.toContain("example.com");
  });

  it("uses the error-body trace id when the response header is missing", () => {
    const error = TRPCClientError.from({
      error: {
        message: "boom",
        code: -32603,
        data: {
          code: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
          path: "projects.create",
          traceId: TRACE_ID,
        },
      },
    });

    reportTrpcErrorWithoutToast(error, "projects");

    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags["dd.trace_id"]).toBe(TRACE_ID);
    expect(options.tags.request_id).toBeUndefined();
  });

  it("prefers the response trace header over the error-body trace id", () => {
    const response = new Response("{}", {
      headers: { "x-dd-trace-id": TRACE_ID },
    });
    const error = TRPCClientError.from(
      {
        error: {
          message: "boom",
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
            path: "projects.create",
            traceId: OTHER_TRACE_ID,
          },
        },
      },
      { meta: { response } },
    );

    expect(trpcCorrelationTags(error)).toEqual({
      "dd.trace_id": TRACE_ID,
    });
  });

  it("leaves a correlation breadcrumb on an expected error and does not capture", () => {
    const response = new Response("{}", {
      headers: correlationHeaders,
    });
    const error = TRPCClientError.from(
      {
        error: {
          message: "not found",
          code: -32004,
          data: {
            code: "NOT_FOUND",
            httpStatus: 404,
            path: "traces.byId",
          },
        },
      },
      { meta: { response } },
    );

    reportTrpcErrorWithoutToast(error, "traces");

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock.mock.calls[0]![0].data).toMatchObject({
      request_id: REQUEST_ID,
      "dd.trace_id": TRACE_ID,
      code: "NOT_FOUND",
    });
  });
});
