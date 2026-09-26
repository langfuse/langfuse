import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { vi } from "vitest";

import { type DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { ModernSessionHeaderActionsController } from "@/src/features/sessions/ModernSessionHeaderActionsController";

const { mockUseSession, copy, copyTextToClipboard } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  copy: vi.fn(),
  copyTextToClipboard: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: mockUseSession }));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/", push: vi.fn() }),
}));

function FlatMenu({ items }: { items: DropdownMenuItemDefinition[] }) {
  return (
    <div>
      {items.map((item) => {
        if (item.type === "item") {
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled !== undefined}
              onClick={item.onClick}
            >
              {item.title}
            </button>
          );
        }
        if (item.type === "checkbox") {
          return (
            <button
              key={item.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={item.checked}
              onClick={() => item.onCheckedChange(!item.checked)}
            >
              {item.title}
            </button>
          );
        }
        if (item.type === "submenu") {
          return (
            <div key={item.id}>
              <div>{item.title}</div>
              <FlatMenu items={item.items} />
            </div>
          );
        }
        return <hr key={item.id} />;
      })}
    </div>
  );
}

vi.mock("@/src/components/design-system/DropdownMenu/DropdownMenu", () => ({
  DropdownMenu: ({
    items,
    children,
  }: {
    items: DropdownMenuItemDefinition[];
    children: (controls: { getTriggerProps: () => object }) => ReactNode;
  }) => (
    <>
      {children({ getTriggerProps: () => ({}) })}
      <FlatMenu items={items} />
    </>
  ),
}));

vi.mock("@/src/components/HeaderActionButton", () => ({
  HeaderActionButton: ({ label }: { label: string }) => (
    <button type="button" aria-label={label} />
  ),
}));

vi.mock("@/src/components/publish-object-switch", () => ({
  getShareUrl: () => "https://example.com",
  usePublishObject: () => ({
    hasAccess: true,
    isPending: false,
    toggle: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy }),
}));

vi.mock("@/src/utils/clipboard", () => ({ copyTextToClipboard }));

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
        />,
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
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Copy events_full query" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Copy events_core query" }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Copy session ID" }));
      expect(copyTextToClipboard).toHaveBeenCalledExactlyOnceWith("session-id");
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
      />,
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
      />,
    );

    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Show tool calls" }),
    );

    expect(onShowInlineToolCallsChange).toHaveBeenCalledWith(true);
  });
});
