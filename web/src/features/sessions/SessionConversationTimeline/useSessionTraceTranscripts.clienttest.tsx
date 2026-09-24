import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { getQueryKey } from "@trpc/react-query";
import { api } from "@/src/utils/api";
import { type AppRouter } from "@/src/server/api/root";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { useSessionTraceTranscripts } from "./useSessionTraceTranscripts";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/src/utils/api", async () => {
  const { createTRPCReact } = await import("@trpc/react-query");
  const trpc = createTRPCReact<AppRouter>();
  return {
    api: {
      events: trpc.events,
      useUtils: () => ({
        client: { events: { transcriptByTraceId: { query } } },
      }),
    },
  };
});

const traces = Array.from({ length: 7 }, (_, index) => ({
  trace: {
    id: `trace-${index}`,
    name: "Test trace",
    timestamp: new Date("2026-01-01T00:00:00Z"),
    environment: "test",
    userId: null,
    observationCount: 1,
    latencyMs: 100,
    scores: [],
  } satisfies EventSessionTrace,
  turnNumber: index + 1,
}));
const output = { transcript: null, cutoff: false };

function setup(client = new QueryClient()) {
  return {
    client,
    ...renderHook(
      () =>
        useSessionTraceTranscripts({
          projectId: "project",
          traces,
          activeTraceIds: new Set(
            traces.slice(0, 6).map(({ trace }) => trace.id),
          ),
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    ),
  };
}

beforeEach(() => {
  query.mockReset();
});

it("bounds concurrent requests and releases slots after success and failure", async () => {
  const pending: Array<{
    resolve: (value: typeof output) => void;
    reject: (reason: Error) => void;
  }> = [];
  query.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  );
  const { result, unmount, client } = setup();
  await waitFor(() => expect(query).toHaveBeenCalledTimes(4));
  expect(result.current.get("trace-4")).toEqual({ state: "loading" });
  expect(result.current.has("trace-6")).toBe(false);

  await act(async () => pending[0]!.resolve(output));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(5));
  await act(async () => pending[1]!.reject(new Error("Request failed")));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(6));
  await waitFor(() =>
    expect(result.current.get("trace-1")).toEqual({ state: "error" }),
  );
  expect(result.current.get("trace-0")).toEqual({ state: "loaded", ...output });
  expect(query.mock.calls.some(([input]) => input.traceId === "trace-6")).toBe(
    false,
  );
  unmount();
  client.clear();
});

it("reuses fresh per-trace cache entries", async () => {
  query.mockResolvedValue(output);
  const client = new QueryClient();
  client.setQueryData(
    getQueryKey(
      api.events.transcriptByTraceId,
      {
        projectId: "project",
        traceId: traces[0]!.trace.id,
        timestamp: traces[0]!.trace.timestamp,
      },
      "query",
    ),
    output,
  );
  const { result, unmount } = setup(client);
  await waitFor(() => expect(query).toHaveBeenCalledTimes(5));
  expect(query.mock.calls.some(([input]) => input.traceId === "trace-0")).toBe(
    false,
  );
  expect(result.current.get("trace-0")).toEqual({ state: "loaded", ...output });
  unmount();
  client.clear();
});

it("aborts active requests and does not start queued requests after unmount", async () => {
  const signals: AbortSignal[] = [];
  query.mockImplementation((_input, { signal }: { signal: AbortSignal }) => {
    signals.push(signal);
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  });
  const { unmount, client } = setup();
  await waitFor(() => expect(query).toHaveBeenCalledTimes(4));
  await act(async () => unmount());
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(query).toHaveBeenCalledTimes(4);
  client.clear();
});
