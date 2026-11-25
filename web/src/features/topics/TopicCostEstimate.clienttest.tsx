import { type FilterState } from "@langfuse/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { httpLink } from "@trpc/client";
import { createTRPCReact, getQueryKey } from "@trpc/react-query";
import superjson from "superjson";
import { type AppRouter } from "@/src/server/api/root";
import { useTopicCostEstimate } from "./TopicCostEstimate";

vi.mock("./useTopicsCapture", () => ({ useTopicsCapture: () => vi.fn() }));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => false,
}));

it("keeps a forecast's error, pending state and cache refresh with its submitted filter", async () => {
  const trpc = createTRPCReact<AppRouter>();
  const cache = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  const retry = Promise.withResolvers<Response>();
  const startEstimate = vi
    .fn()
    .mockRejectedValueOnce(new Error("Estimate failed"))
    .mockReturnValueOnce(retry.promise);
  const readEstimate = vi.fn(() =>
    Response.json({ result: { data: { json: null } } }),
  );
  const client = trpc.createClient({
    links: [
      httpLink({
        url: "http://localhost/api/trpc",
        transformer: superjson,
        fetch: async (_url, init) =>
          init?.method === "POST" ? startEstimate() : readEstimate(),
      }),
    ],
  });

  const all = {
    projectId: "project",
    facetIds: ["intent"],
    filter: [] as FilterState,
  };
  const filtered = {
    ...all,
    filter: [
      { type: "string", column: "name", operator: "=", value: "checkout" },
    ] satisfies FilterState,
  };
  const allKey = getQueryKey(trpc.topics.costEstimate, all, "query");
  cache.setQueryData(allKey, null);
  cache.setQueryData(
    getQueryKey(trpc.topics.costEstimate, filtered, "query"),
    null,
  );

  const { result, rerender } = renderHook(
    (input: typeof all) =>
      useTopicCostEstimate({ ...input, source: "snapshot" }),
    {
      initialProps: all,
      wrapper: ({ children }) => (
        <trpc.Provider client={client} queryClient={cache}>
          <QueryClientProvider client={cache}>{children}</QueryClientProvider>
        </trpc.Provider>
      ),
    },
  );
  act(() => result.current.onStart());
  await waitFor(() => expect(result.current.error).toBe("Estimate failed"));
  rerender(filtered);
  expect(result.current.error).toBeNull();

  rerender(all);
  act(() => result.current.onStart());
  await waitFor(() => expect(result.current.starting).toBe(true));
  rerender(filtered);
  expect(result.current.starting).toBe(false);

  retry.resolve(
    Response.json({ result: { data: { json: { key: "estimate" } } } }),
  );
  await waitFor(() =>
    expect(cache.getQueryState(allKey)?.isInvalidated).toBe(true),
  );
  expect(readEstimate).not.toHaveBeenCalled();
});
