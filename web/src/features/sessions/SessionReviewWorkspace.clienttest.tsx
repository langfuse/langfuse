/** @vitest-environment jsdom */
import { useState, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TraceReviewPanelProvider,
  useTraceReviewPanel,
} from "@/src/features/traces/contexts/TraceReviewPanelContext";
import { SessionReviewLeading } from "./sessionReviewLeading";
import { SessionReviewWorkspace } from "./SessionReviewWorkspace";

const { groupRef, router } = vi.hoisted(() => ({
  groupRef: { current: { setLayout: vi.fn() } },
  router: { query: {}, pathname: "/sessions/session", replace: vi.fn() },
}));

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("react-resizable-panels", () => ({
  useGroupRef: () => groupRef,
  Group: ({
    children,
    orientation,
  }: {
    children: ReactNode;
    orientation: string;
  }) => (
    <div data-testid="workspace-panels" data-orientation={orientation}>
      {children}
    </div>
  ),
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}));
vi.mock("@/src/features/comments/CommentList", () => ({
  CommentList: ({ objectId }: { objectId: string }) => (
    <input aria-label={`Comment on ${objectId}`} defaultValue="" />
  ),
}));
vi.mock("@/src/features/scores/components/AnnotationPanelContent", () => ({
  AnnotationPanelContent: () => (
    <input aria-label="Annotation draft" defaultValue="" />
  ),
}));

function TraceCommentAction() {
  const store = useTraceReviewPanel();
  return (
    <button
      onClick={() =>
        store.getState().actions.openComments({
          target: {
            type: "comments",
            objectType: "TRACE",
            objectId: "trace",
          },
          confirmDiscard: () => true,
        })
      }
    >
      Comment on trace
    </button>
  );
}

function SessionContent() {
  const [draft, setDraft] = useState("");
  const [showTrace, setShowTrace] = useState(true);
  const store = useTraceReviewPanel();
  const actions = store.getState().actions;
  return (
    <>
      <input
        aria-label="Session state"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        onClick={() =>
          actions.openComments({
            target: {
              type: "comments",
              objectType: "SESSION",
              objectId: "session",
            },
            confirmDiscard: () => true,
          })
        }
      >
        Session comments
      </button>
      <button
        onClick={() =>
          actions.openAnnotation({
            scoreTarget: { type: "session", sessionId: "session" },
            scoreMetadata: { projectId: "project" },
            scores: [],
            analyticsData: {
              type: "session",
              source: "SessionDetail",
              isV4: true,
            },
          })
        }
      >
        Annotate session
      </button>
      <button onClick={actions.close}>Close review</button>
      <button onClick={() => setShowTrace(false)}>Unmount trace row</button>
      {showTrace ? <TraceCommentAction /> : null}
    </>
  );
}

function Harness() {
  return (
    <TraceReviewPanelProvider projectId="project">
      <SessionReviewWorkspace projectId="project">
        <SessionReviewLeading>
          <div>Session metrics</div>
        </SessionReviewLeading>
        <SessionContent />
      </SessionReviewWorkspace>
    </TraceReviewPanelProvider>
  );
}

let width = 1200;
const observers = new Set<() => void>();

function resize(nextWidth: number) {
  width = nextWidth;
  act(() => observers.forEach((callback) => callback()));
}

beforeEach(() => {
  width = 1200;
  groupRef.current.setLayout.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe() {
        observers.add(this.callback);
      }
      disconnect() {
        observers.delete(this.callback);
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      width,
      height: 800,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 800,
      right: width,
      toJSON() {},
    }),
  );
});

afterEach(() => {
  cleanup();
  observers.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("session review workspace", () => {
  it("keeps session metrics above both panels and opens a narrow review column", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Annotate session" }));

    const metrics = screen.getByText("Session metrics");
    const panels = screen.getByTestId("workspace-panels");
    expect(metrics.parentElement).toHaveClass("sticky");
    expect(metrics.parentElement?.nextElementSibling).toBe(panels);
    expect(panels.contains(metrics)).toBe(false);

    await waitFor(() => {
      const reviewSizes = groupRef.current.setLayout.mock.calls
        .map((call) => {
          const layout: { review?: number } = call[0] ?? {};
          return layout.review ?? 0;
        })
        .filter((review) => review > 0);
      expect(reviewSizes.at(-1)).toBe(32);
    });
  });

  it("brings an opened stacked editor into its own scrollport", async () => {
    width = 320;
    const { container } = render(<Harness />);
    const root = container.querySelector<HTMLElement>(
      "[data-review-orientation]",
    )!;
    const review = container.querySelector<HTMLElement>(
      "[data-trace-review-panel]",
    )!.parentElement!;
    Object.defineProperty(root, "clientHeight", { value: 400 });
    Object.defineProperty(review, "clientHeight", { value: 320 });
    const bounds = root.getBoundingClientRect();
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ ...bounds, top: 100 }),
    });
    Object.defineProperty(review, "getBoundingClientRect", {
      value: () => ({ ...bounds, top: 500 }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Annotate session" }));

    await waitFor(() => expect(root.scrollTop).toBeGreaterThan(0));
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("preserves session state and both drafts across resizing, switching modes, and closing", () => {
    render(<Harness />);
    const sessionInput = screen.getByLabelText("Session state");
    fireEvent.change(sessionInput, { target: { value: "session draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Session comments" }));
    const commentInput = screen.getByLabelText("Comment on session");
    fireEvent.change(commentInput, { target: { value: "unsent comment" } });

    fireEvent.click(screen.getByRole("button", { name: "Annotate session" }));
    const annotationInput = screen.getByLabelText("Annotation draft");
    fireEvent.change(annotationInput, { target: { value: "score draft" } });
    resize(600);
    expect(screen.getByTestId("workspace-panels")).toHaveAttribute(
      "data-orientation",
      "vertical",
    );
    expect(screen.getByLabelText("Annotation draft")).toBe(annotationInput);
    expect(annotationInput).toHaveValue("score draft");

    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    expect(annotationInput).not.toBeVisible();
    resize(1200);
    fireEvent.click(screen.getByRole("button", { name: "Session comments" }));
    expect(screen.getByTestId("workspace-panels")).toHaveAttribute(
      "data-orientation",
      "horizontal",
    );
    expect(screen.getByLabelText("Comment on session")).toBe(commentInput);
    expect(commentInput).toBeVisible();
    expect(commentInput).toHaveValue("unsent comment");
    expect(screen.getByLabelText("Session state")).toBe(sessionInput);
    expect(sessionInput).toHaveValue("session draft");
  });

  it("keeps a trace comment editor alive when its virtualized row unmounts", () => {
    const result = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Comment on trace" }));
    const commentInput = screen.getByLabelText("Comment on trace");
    fireEvent.change(commentInput, { target: { value: "review note" } });
    fireEvent.click(screen.getByRole("button", { name: "Unmount trace row" }));

    expect(
      screen.queryByRole("button", { name: "Comment on trace" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Comment on trace")).toBe(commentInput);
    expect(commentInput).toBeVisible();
    expect(commentInput).toHaveValue("review note");
    result.unmount();
    expect(observers.size).toBe(0);
  });
});
