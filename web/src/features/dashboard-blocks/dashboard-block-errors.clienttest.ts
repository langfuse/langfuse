import { describe, expect, it } from "vitest";
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";
import { initTRPC, TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { hasDashboardBlocksLoadError } from "./dashboard-block-errors";

const t = initTRPC.create({ transformer: superjson });
const classic = t.router({});
const current = t.router({
  dashboardBlocks: t.router({
    capabilities: t.procedure.query(() => ({
      multiQuery: false,
      markdown: false,
    })),
    getAll: t.procedure.query(() => []),
  }),
});

function clientFor(router: typeof classic) {
  return createTRPCClient<typeof current>({
    links: [
      httpLink({
        url: "http://localhost/api/trpc",
        transformer: superjson,
        fetch: (url, init) =>
          fetchRequestHandler({
            endpoint: "/api/trpc",
            req: new Request(url, init),
            router,
            createContext: () => ({}),
          }),
      }),
    ],
  });
}

async function readFailure(request: Promise<unknown>) {
  try {
    await request;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCClientError);
    return error as TRPCClientError<typeof current>;
  }
  throw new Error("Expected the procedure to fail");
}

describe("saved dashboard block errors", () => {
  it("falls back only for the unavailable capabilities procedure while preserving real failures", async () => {
    const unavailable = await readFailure(
      clientFor(classic).dashboardBlocks.capabilities.query(),
    );
    expect(unavailable.data).toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
      path: "dashboardBlocks.capabilities",
    });
    expect(
      hasDashboardBlocksLoadError({
        capabilitiesError: unavailable,
        savedFailed: false,
      }),
    ).toBe(false);

    for (const code of ["NOT_FOUND", "INTERNAL_SERVER_ERROR"] as const) {
      const failing = t.router({
        dashboardBlocks: t.router({
          capabilities: t.procedure.query(() => {
            throw new TRPCError({
              code,
              message: "Project capability read failed",
            });
          }),
        }),
      });
      const genuine = await readFailure(
        clientFor(failing).dashboardBlocks.capabilities.query(),
      );
      expect(
        hasDashboardBlocksLoadError({
          capabilitiesError: genuine,
          savedFailed: false,
        }),
      ).toBe(true);
    }

    const savedFailure = await readFailure(
      clientFor(classic).dashboardBlocks.getAll.query(),
    );
    expect(savedFailure.data?.path).toBe("dashboardBlocks.getAll");
    expect(
      hasDashboardBlocksLoadError({
        capabilitiesError: null,
        savedFailed: true,
      }),
    ).toBe(true);
    expect(
      hasDashboardBlocksLoadError({
        capabilitiesError: unavailable,
        savedFailed: true,
      }),
    ).toBe(true);
    expect(
      hasDashboardBlocksLoadError({
        capabilitiesError: null,
        savedFailed: false,
      }),
    ).toBe(false);
  });
});
