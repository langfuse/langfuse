import { QueryClient } from "@tanstack/react-query";
import { TrpcNonJsonResponseError } from "@/src/utils/trpcResponseParseError";
import { readDashboardBlockCapabilities } from "./dashboard-block-capabilities";
import { expect, it } from "vitest";
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";
import { initTRPC, TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";

const t = initTRPC.create({ transformer: superjson });
const classic = t.router({});
const current = t.router({
  dashboardBlocks: t.router({
    capabilities: t.procedure.query(() => ({
      multiQuery: false,
      markdown: false,
    })),
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

it("preserves successful flags across transient errors without restoring revoked authoring permissions", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const enabled = { multiQuery: true, markdown: true };
  const disabled = { multiQuery: false, markdown: false };
  let response: "enabled" | "disabled" | "transient" | "denied" = "enabled";
  const router = t.router({
    dashboardBlocks: t.router({
      capabilities: t.procedure.query(() => {
        if (response === "transient")
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (response === "denied") throw new TRPCError({ code: "FORBIDDEN" });
        return response === "enabled" ? enabled : disabled;
      }),
    }),
  });
  const client = clientFor(router);
  const key = ["capabilities", { projectId: "one" }];
  const read = () => client.dashboardBlocks.capabilities.query();
  const attempt = async (queryKey = key, source = read) => {
    try {
      await cache.fetchQuery({
        queryKey,
        queryFn: () =>
          readDashboardBlockCapabilities({
            read: source,
            queryClient: cache,
            queryKey,
          }),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCClientError);
    }
    return cache.getQueryData(queryKey);
  };
  try {
    expect(await attempt()).toEqual(enabled);
    response = "transient";
    expect(await attempt()).toEqual(enabled);
    expect(
      await attempt(key, () =>
        Promise.reject(TRPCClientError.from(new TypeError("Failed to fetch"))),
      ),
    ).toEqual(enabled);
    response = "denied";
    expect(await attempt()).toEqual(disabled);
    expect(cache.getQueryState(key)?.status).toBe("error");
    response = "transient";
    expect(await attempt()).toEqual(disabled);
    expect(
      await attempt(["capabilities", { projectId: "two" }]),
    ).toBeUndefined();
    response = "enabled";
    expect(await attempt()).toEqual(enabled);
    expect(
      await attempt(key, () =>
        Promise.reject(TRPCClientError.from(new TrpcNonJsonResponseError(401))),
      ),
    ).toEqual(disabled);
    response = "transient";
    expect(await attempt()).toEqual(disabled);
    response = "enabled";
    expect(await attempt()).toEqual(enabled);
    expect(
      await attempt(key, () =>
        clientFor(classic).dashboardBlocks.capabilities.query(),
      ),
    ).toEqual(disabled);
    response = "transient";
    expect(await attempt()).toEqual(disabled);
    response = "enabled";
    expect(await attempt()).toEqual(enabled);
    response = "disabled";
    expect(await attempt()).toEqual(disabled);
    response = "transient";
    expect(await attempt()).toEqual(disabled);
  } finally {
    cache.clear();
  }
});
