import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { vi } from "vitest";
import { useStore } from "zustand";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import {
  TraceReviewPanelProvider,
  useTraceReviewPanel,
} from "@/src/features/traces/contexts/TraceReviewPanelContext";
import {
  CommentDrawerController,
  type CommentDrawerControllerProps,
  getCommentDrawerInitialStateFromUrl,
} from "@/src/features/comments/CommentDrawerController";

const { fetchComments, invalidateComments, router } = vi.hoisted(() => ({
  fetchComments: vi.fn(),
  invalidateComments: vi.fn(),
  router: {
    isReady: true,
    pathname: "/project/[projectId]/traces/[traceId]",
    query: {} as Record<string, string>,
    replace: vi.fn(),
  },
}));

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => true }));
vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      comments: {
        getByObjectId: { fetch: fetchComments, invalidate: invalidateComments },
        getCountByObjectId: { invalidate: vi.fn() },
        getCountByObjectType: { invalidate: vi.fn() },
        getTraceCommentCountsBySessionId: { invalidate: vi.fn() },
      },
    }),
  },
}));
vi.mock("@/src/features/comments/CommentList", () => ({
  CommentList: () => <p>Existing discussion</p>,
}));
vi.mock("@/src/features/comments/components/CommentComposer", () => ({
  CommentComposer: ({
    onCommentCreated,
  }: {
    onCommentCreated: () => Promise<void>;
  }) => (
    <button
      onClick={async () => {
        fetchComments.mockResolvedValue([{ id: "posted-comment" }]);
        await onCommentCreated();
      }}
    >
      Post comment
    </button>
  ),
}));

const target = {
  type: "comments" as const,
  objectId: "trace-id",
  objectType: "TRACE" as const,
};

function EmbeddedReviewState() {
  const store = useTraceReviewPanel();
  const active = useStore(store, (state) => state.active);
  const objectId = useStore(store, (state) => state.comments?.target.objectId);
  return (
    <>
      <output>{active === "comments" ? objectId : "closed"}</output>
      <button onClick={store.getState().actions.close}>Close review</button>
    </>
  );
}

describe("CommentDrawerController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    router.query = {};
    router.isReady = true;
    fetchComments.mockResolvedValue([]);
    invalidateComments.mockResolvedValue(undefined);
  });

  it("opens embedded comments immediately without a lookup or rerendering the trigger", () => {
    const renderView = vi.fn(
      ({
        openDrawer,
      }: Parameters<CommentDrawerControllerProps["children"]>[0]) => (
        <button onClick={() => openDrawer(target)}>Open comments</button>
      ),
    );
    render(
      <TraceReviewPanelProvider projectId="project-id">
        <CommentDrawerController projectId="project-id" count={0}>
          {renderView}
        </CommentDrawerController>
        <EmbeddedReviewState />
      </TraceReviewPanelProvider>,
    );
    const initialRenders = renderView.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Open comments" }));
    expect(screen.getByRole("status")).toHaveTextContent(target.objectId);
    expect(fetchComments).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(renderView).toHaveBeenCalledTimes(initialRenders);
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    expect(screen.getByRole("status")).toHaveTextContent("closed");
    expect(renderView).toHaveBeenCalledTimes(initialRenders);
  });

  it("uses the fetched thread when counts are missing or stale, then opens the discussion after posting", async () => {
    const onCommentChange = vi.fn();
    const controller = (count?: number) => (
      <CommentDrawerController
        projectId="project-id"
        count={count}
        onCommentChange={onCommentChange}
      >
        {({ disabled, openDrawer }) => (
          <button disabled={disabled} onClick={() => openDrawer(target)}>
            Open comments
          </button>
        )}
      </CommentDrawerController>
    );
    const { rerender } = render(controller(), { wrapper: LayerProvider });

    fireEvent.click(screen.getByRole("button", { name: "Open comments" }));
    expect(
      await screen.findByRole("dialog", { name: "Add a comment" }),
    ).toBeVisible();
    expect(screen.queryByText("Existing discussion")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    rerender(controller(12));
    fireEvent.click(screen.getByRole("button", { name: "Open comments" }));
    expect(
      await screen.findByRole("dialog", { name: "Add a comment" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onCommentChange).toHaveBeenCalledOnce();
    expect(invalidateComments).toHaveBeenCalledWith({
      projectId: "project-id",
      objectId: target.objectId,
      objectType: target.objectType,
    });

    rerender(controller(0));
    fireEvent.click(screen.getByRole("button", { name: "Open comments" }));
    expect(
      await screen.findByRole("dialog", { name: "Comments" }),
    ).toBeVisible();
    expect(screen.getByText("Existing discussion")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Post comment" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the owning view stable while resolving, opening, and closing comments", async () => {
    let resolveComments!: (comments: { id: string }[]) => void;
    fetchComments.mockReturnValue(
      new Promise((resolve) => {
        resolveComments = resolve;
      }),
    );
    const renderView = vi.fn(
      ({
        openDrawer,
      }: Parameters<CommentDrawerControllerProps["children"]>[0]) => (
        <button onClick={() => openDrawer(target)}>Open comments</button>
      ),
    );
    render(
      <CommentDrawerController projectId="project-id">
        {renderView}
      </CommentDrawerController>,
      { wrapper: LayerProvider },
    );
    const initialRenders = renderView.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Open comments" }));
    expect(renderView).toHaveBeenCalledTimes(initialRenders);
    await act(async () => resolveComments([{ id: "existing" }]));
    expect(
      await screen.findByRole("dialog", { name: "Comments" }),
    ).toBeVisible();
    expect(renderView).toHaveBeenCalledTimes(initialRenders);
    fireEvent.click(screen.getByRole("button", { name: "Close comments" }));
    expect(screen.getByRole("dialog", { name: "Comments" })).toHaveAttribute(
      "data-state",
      "closed",
    );
    expect(renderView).toHaveBeenCalledTimes(initialRenders);
  });

  it("returns focus to the opening action when the fallback discussion closes", async () => {
    fetchComments.mockResolvedValue([{ id: "existing" }]);
    render(
      <CommentDrawerController projectId="project-id">
        {({ openDrawer }) => (
          <button onClick={() => openDrawer(target)}>More actions</button>
        )}
      </CommentDrawerController>,
      { wrapper: LayerProvider },
    );
    const trigger = screen.getByRole("button", { name: "More actions" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Comments" });
    dialog.style.animationName = "none";
    screen.getByRole("button", { name: "Close comments" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("ignores an obsolete lookup instead of opening a second overlay", async () => {
    let resolveFirst!: (comments: { id: string }[]) => void;
    fetchComments.mockImplementation(({ objectId }) =>
      objectId === "first"
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve([{ id: "existing" }]),
    );
    render(
      <CommentDrawerController projectId="project-id">
        {({ openDrawer }) => (
          <>
            <button
              onClick={() => openDrawer({ ...target, objectId: "first" })}
            >
              First
            </button>
            <button
              onClick={() => openDrawer({ ...target, objectId: "second" })}
            >
              Second
            </button>
          </>
        )}
      </CommentDrawerController>,
      { wrapper: LayerProvider },
    );
    fireEvent.click(screen.getByRole("button", { name: "First" }));
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    expect(
      await screen.findByRole("dialog", { name: "Comments" }),
    ).toBeVisible();
    await act(async () => resolveFirst([]));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Comments" })).toHaveAttribute(
      "data-state",
      "open",
    );
    expect(
      screen.queryByRole("dialog", { name: "Add a comment" }),
    ).not.toBeInTheDocument();
  });

  it("opens a deep-linked discussion without a cached count", async () => {
    router.query = {
      comments: "open",
      commentObjectId: target.objectId,
      commentObjectType: target.objectType,
    };
    const view = () => (
      <CommentDrawerController
        projectId="project-id"
        initialState={() => getCommentDrawerInitialStateFromUrl(router.query)}
      >
        {() => <span>Trace</span>}
      </CommentDrawerController>
    );
    const { rerender } = render(view(), { wrapper: LayerProvider });

    expect(
      await screen.findByRole("dialog", { name: "Comments" }),
    ).toBeVisible();
    expect(screen.getByText("Existing discussion")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Post comment" }),
    ).not.toBeInTheDocument();
    const openDialog = screen.getByRole("dialog", { name: "Comments" });
    rerender(view());
    expect(screen.getByRole("dialog", { name: "Comments" })).toBe(openDialog);
    fireEvent.click(screen.getByRole("button", { name: "Close comments" }));
    expect(openDialog).toHaveAttribute("data-state", "closed");
    router.isReady = false;
    rerender(view());
    router.isReady = true;
    rerender(view());
    expect(
      screen.queryByRole("dialog", { name: "Comments" }),
    ).not.toBeInTheDocument();
  });
});
