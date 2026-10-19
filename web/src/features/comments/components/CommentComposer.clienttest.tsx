import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CommentComposer } from "./CommentComposer";

const mocks = vi.hoisted(() => ({
  focus: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => false }));
vi.mock("@/src/utils/api", () => ({
  api: {
    comments: {
      create: {
        useMutation: ({ onSuccess }: { onSuccess: () => Promise<void> }) => ({
          mutate: () => {
            mocks.mutate();
            return onSuccess();
          },
          isPending: false,
        }),
      },
    },
  },
}));
vi.mock("../hooks/useMentionAutocomplete", () => ({
  useMentionAutocomplete: () => ({
    showDropdown: false,
    closeDropdown: vi.fn(),
    updateQuery: vi.fn(),
    users: [],
    selectedIndex: 0,
    mentionStartPos: null,
  }),
}));
vi.mock("./CommentEditor", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    CommentEditor: forwardRef(function Editor(
      { value, onChange }: { value: string; onChange: (value: string) => void },
      ref,
    ) {
      useImperativeHandle(ref, () => ({ focus: mocks.focus }));
      return (
        <textarea
          aria-label="New comment"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }),
  };
});

it("does not restore focus after the composer becomes inactive during comment refresh", async () => {
  let resolveRefresh!: () => void;
  const onCommentCreated = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      }),
  );
  const composer = (isActive: boolean) => (
    <CommentComposer
      projectId="project"
      objectId="trace"
      objectType="TRACE"
      isActive={isActive}
      onCommentCreated={onCommentCreated}
    />
  );
  const { rerender } = render(composer(true));
  fireEvent.change(screen.getByRole("textbox", { name: "New comment" }), {
    target: { value: "Review note" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Comment" }));
  await waitFor(() => expect(onCommentCreated).toHaveBeenCalledOnce());
  rerender(composer(false));
  await act(async () => resolveRefresh());
  expect(mocks.mutate).toHaveBeenCalledOnce();
  expect(mocks.focus).not.toHaveBeenCalled();
});
