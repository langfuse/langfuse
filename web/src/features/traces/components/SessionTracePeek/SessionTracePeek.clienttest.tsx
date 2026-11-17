import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { type NextRouter, useRouter } from "next/router";
import { StringParam, useQueryParam } from "use-query-params";
import { SessionTracePeek } from "./SessionTracePeek";

vi.mock("@/src/components/table/peek/TablePeekViewTraceDetail", () => ({
  TablePeekViewTraceDetail: ({
    closePeek,
    disableScopeToggle,
  }: {
    closePeek: () => void;
    disableScopeToggle?: boolean;
  }) => {
    const router = useRouter();
    const [observation, setObservation] = useQueryParam(
      "observation",
      StringParam,
    );
    return (
      <div>
        <span>{router.query.peek}</span>
        <span>{observation}</span>
        <button onClick={() => setObservation("next-observation", "pushIn")}>
          Select observation
        </button>
        <button
          onClick={() =>
            router.replace({
              pathname: router.pathname,
              query: { ...router.query, traceTab: "metadata" },
            })
          }
        >
          Select detail tab
        </button>
        <button onClick={closePeek}>Close detail</button>
        <button
          onClick={() =>
            router.push("/project/p1/traces/another", undefined, {
              scroll: false,
            })
          }
        >
          Navigate page
        </button>
        <button
          onClick={() =>
            router.push("https://example.com/project/p1/sessions?tab=other")
          }
        >
          Navigate external
        </button>
        <button
          onClick={() =>
            router.replace({
              query: { ...router.query, sessionId: "outer", tags: ["a", "b"] },
            })
          }
        >
          Select multiple filters
        </button>
        {!disableScopeToggle && <button>Session</button>}
      </div>
    );
  },
}));

function setup() {
  const router: NextRouter = {
    pathname: "/project/[projectId]/sessions",
    route: "/project/[projectId]/sessions",
    asPath: "/project/p1/sessions?peek=session-1&traceView=messages",
    query: {
      projectId: "p1",
      peek: "session-1",
      traceView: "messages",
      sessionPeek: "peek=trace-1&observation=observation-1&aggregation=trace",
    },
    basePath: "",
    isLocaleDomain: false,
    isReady: true,
    isFallback: false,
    isPreview: false,
    push: vi.fn().mockResolvedValue(true),
    replace: vi.fn().mockResolvedValue(true),
    back: vi.fn(),
    forward: vi.fn(),
    reload: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
    beforePopState: vi.fn(),
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  };
  const onClose = vi.fn();
  render(
    <RouterContext.Provider value={router}>
      <SessionTracePeek
        projectId="p1"
        search={String(router.query.sessionPeek)}
        onClose={onClose}
      />
    </RouterContext.Provider>,
  );
  return { router, onClose };
}

describe("session detail stacked peek", () => {
  it("reads the trace and observation without taking over the session peek", () => {
    setup();
    expect(screen.getByText("trace-1")).toBeInTheDocument();
    expect(screen.getByText("observation-1")).toBeInTheDocument();
    expect(screen.queryByText("session-1")).toBeNull();
  });

  it("isolates query-param observation selection from the session workspace", async () => {
    const { router } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Select observation" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(router.push).toHaveBeenCalledWith(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          sessionPeek:
            "peek=trace-1&observation=next-observation&aggregation=trace",
        },
      },
      undefined,
      expect.objectContaining({ shallow: true }),
    );
  });

  it("isolates router-based detail tab changes", () => {
    const { router } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Select detail tab" }));
    expect(router.replace).toHaveBeenCalledWith(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          sessionPeek:
            "peek=trace-1&observation=observation-1&aggregation=trace&traceTab=metadata",
        },
      },
      undefined,
      { shallow: true },
    );
  });

  it.each(["Close detail"])("%s returns to the session", (label) => {
    const { onClose, router } = setup();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("hides scope switching in the stacked layer", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Session" })).toBeNull();
  });

  it("delegates navigation to another page without changing its options", () => {
    const { router } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Navigate page" }));
    expect(router.push).toHaveBeenCalledWith(
      "/project/p1/traces/another",
      undefined,
      { scroll: false },
    );
  });

  it("does not capture an external URL with the same pathname", () => {
    const { router } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Navigate external" }));
    expect(router.push).toHaveBeenCalledWith(
      "https://example.com/project/p1/sessions?tab=other",
      undefined,
      undefined,
    );
  });

  it("preserves repeated values but excludes outer route parameters", () => {
    const { router } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Select multiple filters" }),
    );
    expect(router.replace).toHaveBeenCalledWith(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          sessionPeek:
            "peek=trace-1&observation=observation-1&aggregation=trace&tags=a&tags=b",
        },
      },
      undefined,
      { shallow: true },
    );
  });
});
