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
  canInvite: false,
  openInviteDialog: vi.fn(),
}));

// The invite controller needs the router; this test is about its host.
vi.mock(
  "@/src/features/rbac/components/CreateProjectMemberDialogController",
  () => ({
    CreateProjectMemberDialogController: ({
      children,
    }: {
      children: (control: {
        hasAccess: boolean;
        openDialog: () => void;
      }) => unknown;
    }) =>
      children({
        hasAccess: mocks.canInvite,
        openDialog: mocks.openInviteDialog,
      }),
  }),
);
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => false,
}));
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

describe("the invite link", () => {
  const composer = (
    <CommentComposer
      projectId="project"
      objectId="trace"
      objectType="TRACE"
      isActive
      onCommentCreated={vi.fn()}
    />
  );

  beforeEach(() => {
    mocks.mutate.mockClear();
  });

  afterEach(() => {
    mocks.canInvite = false;
    mocks.openInviteDialog.mockClear();
  });

  it("opens the invite dialog for someone who can invite", () => {
    mocks.canInvite = true;
    render(composer);

    fireEvent.click(screen.getByRole("button", { name: "Invite teammates" }));

    expect(mocks.openInviteDialog).toHaveBeenCalledOnce();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("is hidden from someone who can't invite", () => {
    render(composer);

    expect(
      screen.queryByRole("button", { name: "Invite teammates" }),
    ).not.toBeInTheDocument();
  });
});
