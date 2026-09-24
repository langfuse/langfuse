import { fireEvent, render, screen } from "@testing-library/react";
import { type RouterOutputs } from "@/src/utils/api";
import { CommentList } from "./CommentList";

const { useCommentsQuery, composerRenders } = vi.hoisted(() => ({
  useCommentsQuery: vi.fn(),
  composerRenders: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    comments: {
      getByObjectId: { useQuery: useCommentsQuery },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    commentReactions: {
      add: { useMutation: () => ({ mutate: vi.fn() }) },
      remove: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    useUtils: () => ({
      comments: {
        getByObjectId: { invalidate: vi.fn() },
        getCountByObjectId: { invalidate: vi.fn() },
        getCountByObjectType: { invalidate: vi.fn() },
        getTraceCommentCountsBySessionId: { invalidate: vi.fn() },
      },
      commentReactions: { invalidate: vi.fn() },
    }),
  },
}));

vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "reviewer" } },
  }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/project/project-1/traces/trace-1" }),
}));

vi.mock("./components/CommentCard", () => ({
  CommentCard: ({ content }: { content: string }) => (
    <article>{content}</article>
  ),
}));

vi.mock("./components/CommentComposer", async () => {
  const { useState } = await import("react");
  return {
    CommentComposer: function MockCommentComposer() {
      composerRenders();
      const [draft, setDraft] = useState("");
      return (
        <input
          aria-label="New comment"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      );
    },
  };
});

describe("CommentList draft lifecycle", () => {
  it("retains a draft after a background query error and resets it for a different object", () => {
    const comments: RouterOutputs["comments"]["getByObjectId"] = [
      {
        id: "comment-1",
        content: "Existing discussion",
        createdAt: new Date("2026-09-01T12:00:00Z"),
        updatedAt: new Date("2026-09-01T12:00:00Z"),
        authorUserId: "reviewer",
        authorUserName: "Reviewer",
        authorUserImage: null,
        dataField: null,
        path: [],
        rangeStart: [],
        rangeEnd: [],
      },
    ];
    const queryResult = {
      data: comments,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    useCommentsQuery.mockReturnValue(queryResult);

    const { rerender } = render(
      <CommentList
        projectId="project-1"
        objectId="trace-1"
        objectType="TRACE"
      />,
    );
    expect(screen.getByText("Existing discussion")).toBeInTheDocument();
    const composer = screen.getByRole("textbox", { name: "New comment" });
    fireEvent.change(composer, { target: { value: "Unsent review" } });

    const renderCount = composerRenders.mock.calls.length;
    fireEvent.change(screen.getByRole("textbox", { name: "Search comments" }), {
      target: { value: "discussion" },
    });
    expect(composerRenders).toHaveBeenCalledTimes(renderCount);

    useCommentsQuery.mockReturnValue({ ...queryResult, isError: true });
    rerender(
      <CommentList
        projectId="project-1"
        objectId="trace-1"
        objectType="TRACE"
      />,
    );
    expect(screen.getByText("Existing discussion")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "New comment" })).toBe(composer);
    expect(composer).toHaveValue("Unsent review");

    useCommentsQuery.mockReturnValue({ ...queryResult, data: [] });
    rerender(
      <CommentList
        projectId="project-1"
        objectId="trace-2"
        objectType="TRACE"
      />,
    );
    expect(screen.getByRole("textbox", { name: "New comment" })).toHaveValue(
      "",
    );
    expect(composer).not.toBeInTheDocument();
  });
});
