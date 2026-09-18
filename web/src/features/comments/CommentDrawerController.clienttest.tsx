import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import {
  CommentDrawerController,
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
        getByObjectId: { fetch: fetchComments },
        invalidate: invalidateComments,
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

describe("CommentDrawerController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    router.query = {};
    fetchComments.mockResolvedValue([]);
    invalidateComments.mockResolvedValue(undefined);
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

  it("opens a deep-linked discussion without a cached count", async () => {
    router.query = {
      comments: "open",
      commentObjectId: target.objectId,
      commentObjectType: target.objectType,
    };
    render(
      <CommentDrawerController
        projectId="project-id"
        initialState={() => getCommentDrawerInitialStateFromUrl(router.query)}
      >
        {() => <span>Trace</span>}
      </CommentDrawerController>,
      { wrapper: LayerProvider },
    );

    expect(
      await screen.findByRole("dialog", { name: "Comments" }),
    ).toBeVisible();
    expect(screen.getByText("Existing discussion")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Post comment" }),
    ).not.toBeInTheDocument();
  });
});
