import { type ComponentProps, type ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TraceMessagesView } from "./TraceMessagesView";
import { type SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { type useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { SessionConversationTimelineTrace } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";

const mocks = vi.hoisted(() => ({
  traceData: vi.fn(),
  sessionQuery: vi.fn(),
  transcript: vi.fn(),
  replace: vi.fn(),
  refetch: vi.fn(),
  openDetails: vi.fn(),
  sessionTranscripts: vi.fn(),
  controller:
    vi.fn<
      (
        traces: Parameters<typeof useSessionConversationTimelineController>[0],
        onVisible?: (traceIds: string[]) => void,
      ) => void
    >(),
}));
const timestamp = new Date("2026-10-23T12:00:00.000Z");

vi.mock("@/src/features/traces/contexts/TraceDataContext", () => ({
  useTraceData: () => mocks.traceData(),
}));
vi.mock("@/src/features/traces/contexts/SelectionContext", () => ({
  useSelection: () => ({ openDetails: mocks.openDetails }),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    sessions: {
      tracesFromEvents: {
        useQuery: (...args: unknown[]) => mocks.sessionQuery(...args),
      },
    },
  },
}));
vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/project/[projectId]/traces/[traceId]",
    query: {
      projectId: "p",
      traceId: "anchor",
      peek: "original-peek",
      aggregation: "session",
      traceView: "messages",
      observation: "old-observation",
      traceTab: "scores",
      view: "timeline",
    },
    replace: mocks.replace,
  }),
}));
vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParam: () => [undefined, vi.fn()],
}));
vi.mock("@sentry/nextjs", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./hooks/useTraceMessagesNavigation", () => ({
  useTraceMessagesNavigation: () => ({
    messageTrace: { id: "anchor", projectId: "p" },
    navigation: {},
  }),
}));
vi.mock("./hooks/useTraceMessagesTranscript", () => ({
  useTraceMessagesTranscript: (...args: unknown[]) => mocks.transcript(...args),
}));
vi.mock(
  "@/src/features/sessions/hooks/useSessionConversationTimelineController",
  () => ({
    useSessionConversationTimelineController: (
      ...args: Parameters<typeof useSessionConversationTimelineController>
    ) => {
      mocks.controller(...args);
      return {};
    },
  }),
);
vi.mock("@/src/features/sessions/hooks/useSessionTraceTranscripts", () => ({
  useSessionTraceTranscripts: (...args: unknown[]) =>
    mocks.sessionTranscripts(...args),
}));
vi.mock(
  "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/SessionTranscriptContent",
  () => ({
    SessionTranscriptContent: ({ variant }: { variant?: string }) => (
      <div>
        {variant === "single-trace"
          ? "Trace message surface"
          : "Session page surface"}
      </div>
    ),
  }),
);
vi.mock(
  "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline",
  () => ({
    SessionConversationTimeline: ({
      traces,
    }: ComponentProps<typeof SessionConversationTimeline>) => {
      if (traces.every(({ variant }) => variant === "single-trace"))
        return <div>Single trace messages</div>;
      const otherTrace = traces.find(({ trace }) => trace.id === "other");
      return (
        <div>
          <div>{traces.map(({ trace }) => trace.id).join(", ")}</div>
          <div>
            {traces.every(({ variant }) => variant === "embedded-session")
              ? "Embedded session messages"
              : "Session page messages"}
          </div>
          {otherTrace && (
            <>
              <button onClick={otherTrace.onOpenTrace}>Open trace</button>
              <button
                onClick={() =>
                  otherTrace.onOpenObservation("message-observation")
                }
              >
                Open observation
              </button>
            </>
          )}
        </div>
      );
    },
  }),
);
vi.mock(
  "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/ConnectedModernSessionBodyTimeline",
  () => ({
    ConnectedModernSessionBodyTimeline: () => {
      throw new Error(
        "The embedded view must not mount the session page shell",
      );
    },
  }),
);

describe("TraceMessagesView scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.replace.mockResolvedValue(true);
    mocks.sessionTranscripts.mockReturnValue(new Map());
    mocks.traceData.mockReturnValue({
      trace: { id: "anchor", projectId: "p", sessionId: "s" },
      // The capped tree knows only one trace; Messages must use the full list.
      sessionTraces: [{ id: "anchor" }],
      isPlaceholderData: false,
    });
    mocks.sessionQuery.mockReturnValue({
      data: [
        { id: "anchor", timestamp },
        { id: "other", timestamp },
      ],
      isError: false,
      refetch: mocks.refetch,
    });
    mocks.transcript.mockReturnValue({
      data: undefined,
      state: { type: "loading" },
    });
  });

  it("uses the full session conversation, not the capped tree or anchor transcript", () => {
    render(<TraceMessagesView />);
    expect(screen.getByText("anchor, other")).toBeInTheDocument();
    expect(screen.getByText("Embedded session messages")).toBeInTheDocument();
    expect(mocks.sessionQuery).toHaveBeenCalledWith(
      { projectId: "p", sessionId: "s" },
      expect.objectContaining({ enabled: true }),
    );
    expect(mocks.transcript).not.toHaveBeenCalled();
  });

  it("keeps trace scope on the existing single-trace messages view", () => {
    mocks.traceData.mockReturnValue({
      trace: { id: "anchor", projectId: "p", sessionId: "s" },
      isPlaceholderData: false,
    });
    render(<TraceMessagesView />);
    expect(screen.getByText("Single trace messages")).toBeInTheDocument();
    expect(mocks.transcript).toHaveBeenCalled();
    expect(mocks.sessionQuery).not.toHaveBeenCalled();
  });

  it("switches Messages back to one trace when session scope is cleared", () => {
    const { rerender } = render(<TraceMessagesView />);
    expect(screen.getByText("anchor, other")).toBeInTheDocument();
    mocks.traceData.mockReturnValue({
      trace: { id: "anchor", projectId: "p", sessionId: "s" },
      isPlaceholderData: false,
    });
    rerender(<TraceMessagesView />);
    expect(screen.getByText("Single trace messages")).toBeInTheDocument();
    expect(screen.queryByText("anchor, other")).not.toBeInTheDocument();
  });

  it("shows a loading state without the session page shell", () => {
    mocks.sessionQuery.mockReturnValue({ data: undefined, isError: false });
    render(<TraceMessagesView />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading session messages",
    );
  });

  it("loads transcripts in bounded chunks as the message timeline scrolls", () => {
    mocks.sessionQuery.mockReturnValue({
      data: Array.from({ length: 45 }, (_, index) => ({
        id: `trace-${index}`,
        timestamp,
      })),
      isError: false,
    });
    render(<TraceMessagesView />);
    expect(mocks.sessionTranscripts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeTraceIds: new Set(
          Array.from({ length: 20 }, (_, index) => `trace-${index}`),
        ),
      }),
    );
    const onVisible = mocks.controller.mock.calls.at(-1)?.[1];
    act(() => onVisible?.(["trace-25"]));
    expect(mocks.sessionTranscripts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeTraceIds: new Set(
          Array.from({ length: 40 }, (_, index) => `trace-${index}`),
        ),
      }),
    );
  });

  it("keeps the trace separator but uses the trace-level message surface when embedded", () => {
    render(
      <SessionConversationTimelineTrace
        trace={{ id: "other", name: "Other trace" }}
        turnNumber={2}
        variant="embedded-session"
        state={{
          type: "transcript",
          result: { state: "loaded", transcript: null, cutoff: false },
        }}
        onOpenTrace={vi.fn()}
        onOpenObservation={vi.fn()}
        scrollTarget={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Other trace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Trace message surface")).toBeInTheDocument();
    expect(screen.queryByText("Session page surface")).not.toBeInTheDocument();
  });

  it("can retry a failed session trace-list request", () => {
    mocks.sessionQuery.mockReturnValue({
      data: undefined,
      isError: true,
      refetch: mocks.refetch,
    });
    render(<TraceMessagesView />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it.each([
    ["Open observation", "message-observation"],
    ["Open trace", "trace-other"],
  ])(
    "%s targets the correct trace while preserving session scope and peek",
    async (button, observation) => {
      render(<TraceMessagesView />);
      fireEvent.click(screen.getByRole("button", { name: button }));
      await waitFor(() => expect(mocks.openDetails).toHaveBeenCalledOnce());
      expect(mocks.replace).toHaveBeenCalledWith(
        {
          pathname: "/project/[projectId]/traces/[traceId]",
          query: {
            projectId: "p",
            traceId: "other",
            peek: "original-peek",
            aggregation: "session",
            observation,
            timestamp: timestamp.toISOString(),
            view: "timeline",
          },
        },
        undefined,
        { shallow: true },
      );
    },
  );
});
