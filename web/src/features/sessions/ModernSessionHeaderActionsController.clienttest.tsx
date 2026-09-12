import { fireEvent, render, screen } from "@testing-library/react";
import { type MouseEventHandler, type ReactNode } from "react";
import { vi } from "vitest";

import { ModernSessionHeaderActionsController } from "@/src/features/sessions/ModernSessionHeaderActionsController";
import { DropdownMenuTrigger } from "@/src/components/ui/dropdown-menu";

const { mockUseSession, copy } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  copy: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: mockUseSession }));

vi.mock("@/src/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onClick,
  }: {
    children: ReactNode;
    checked: boolean;
    onClick: MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ sessions: { invalidate: vi.fn() } }),
    sessions: {
      publish: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

describe("ModernSessionHeaderActionsController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: { user: { admin: false } } });
  });

  it.each(["events_full", "events_core"])(
    "copies all session rows from %s with escaped identifiers",
    (table) => {
      mockUseSession.mockReturnValue({ data: { user: { admin: true } } });
      render(
        <ModernSessionHeaderActionsController
          projectId={"project'\\id"}
          sessionId={"session'\\id"}
          isPublic={false}
        >
          <button type="button">Actions</button>
        </ModernSessionHeaderActionsController>,
      );

      fireEvent.click(
        screen.getByRole("button", { name: `Copy ${table} query` }),
      );

      expect(copy).toHaveBeenCalledExactlyOnceWith(
        "WITH\n" +
          "  'project\\'\\\\id' AS target_project_id,\n" +
          "  'session\\'\\\\id' AS target_session_id\n" +
          `SELECT *\nFROM ${table}\n` +
          "WHERE project_id = target_project_id\n" +
          "  AND trace_id IN (\n" +
          "    SELECT trace_id\n" +
          "    FROM events_core\n" +
          "    WHERE project_id = target_project_id\n" +
          "      AND trace_id IN (\n" +
          "        SELECT trace_id\n" +
          "        FROM events_core\n" +
          "        WHERE project_id = target_project_id\n" +
          "          AND session_id = target_session_id\n" +
          "      )\n" +
          "    GROUP BY trace_id\n" +
          "    HAVING argMaxIf(session_id, event_ts, session_id <> '') = target_session_id\n" +
          "  )\n" +
          "ORDER BY start_time ASC, event_ts DESC;",
      );
    },
  );

  it.each([{ user: { admin: false } }, { user: {} }, null])(
    "hides query copying without an instance admin (%j)",
    (data) => {
      mockUseSession.mockReturnValue({ data });
      render(
        <ModernSessionHeaderActionsController
          projectId="project-id"
          sessionId="session-id"
          isPublic={false}
        >
          <button type="button">Actions</button>
        </ModernSessionHeaderActionsController>,
      );

      expect(
        screen.queryByRole("button", { name: "Copy events_full query" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Copy events_core query" }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Copy session ID" }));
      expect(copy).toHaveBeenCalledExactlyOnceWith("session-id");
    },
  );

  it("keeps the timeline display setting reachable from the actions menu", () => {
    const onShowSystemPromptChange = vi.fn();

    render(
      <ModernSessionHeaderActionsController
        projectId="project-id"
        sessionId="session-id"
        isPublic={false}
        showSystemPrompt={false}
        onShowSystemPromptChange={onShowSystemPromptChange}
      >
        <DropdownMenuTrigger asChild>
          <button type="button">Actions</button>
        </DropdownMenuTrigger>
      </ModernSessionHeaderActionsController>,
    );

    expect(screen.getByText("Display")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Show system prompt" }),
    );

    expect(onShowSystemPromptChange).toHaveBeenCalledWith(true);
  });

  it("shows the legacy tool-call setting only when provided", () => {
    const onShowInlineToolCallsChange = vi.fn();

    render(
      <ModernSessionHeaderActionsController
        projectId="project-id"
        sessionId="session-id"
        isPublic={false}
        showInlineToolCalls={false}
        showSystemPrompt={false}
        onShowInlineToolCallsChange={onShowInlineToolCallsChange}
        onShowSystemPromptChange={vi.fn()}
      >
        <DropdownMenuTrigger asChild>
          <button type="button">Actions</button>
        </DropdownMenuTrigger>
      </ModernSessionHeaderActionsController>,
    );

    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Show tool calls" }),
    );

    expect(onShowInlineToolCallsChange).toHaveBeenCalledWith(true);
  });
});
