import { renderHook } from "@testing-library/react";
import { vi } from "vitest";

import { useSessionHeaderMenuItems } from "@/src/features/sessions/useSessionHeaderMenuItems";

const { mockUseSession, copy } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  copy: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: mockUseSession }));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/", push: vi.fn() }),
}));

vi.mock("@/src/components/usePublishObject", () => ({
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

describe("useSessionHeaderMenuItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: { user: { admin: false } } });
  });

  it.each(["events_full", "events_core"])(
    "copies all session rows from %s with escaped identifiers",
    async (table) => {
      mockUseSession.mockReturnValue({ data: { user: { admin: true } } });
      const { result } = renderHook(() =>
        useSessionHeaderMenuItems({
          projectId: "project'\\id",
          sessionId: "session'\\id",
          isPublic: false,
        }),
      );
      const item = result.current.find(
        (item) => item.id === `copy-${table}-query`,
      );
      expect(item?.type).toBe("item");
      if (item?.type !== "item") throw new Error("Expected query action");
      await item.onClick?.();

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
      const { result } = renderHook(() =>
        useSessionHeaderMenuItems({
          projectId: "project-id",
          sessionId: "session-id",
          isPublic: false,
        }),
      );
      expect(result.current.map((item) => item.id)).not.toContain(
        "copy-events_full-query",
      );
      expect(result.current.map((item) => item.id)).not.toContain(
        "copy-events_core-query",
      );
      const item = result.current.find((item) => item.id === "copy-session-id");
      expect(item?.type).toBe("item");
      if (item?.type !== "item") throw new Error("Expected session ID action");
      item.onClick?.();
      expect(copy).toHaveBeenCalledExactlyOnceWith("session-id");
    },
  );

  it("keeps the timeline display setting reachable from the actions menu", () => {
    const onShowSystemPromptChange = vi.fn();

    const { result } = renderHook(() =>
      useSessionHeaderMenuItems({
        projectId: "project-id",
        sessionId: "session-id",
        isPublic: false,
        showSystemPrompt: false,
        onShowSystemPromptChange,
      }),
    );
    const display = result.current.find((item) => item.id === "display");
    expect(display?.type).toBe("submenu");
    if (display?.type !== "submenu")
      throw new Error("Expected Display submenu");
    const item = display.items.find((item) => item.id === "show-system-prompt");
    expect(item).toMatchObject({ type: "checkbox", checked: false });
    if (item?.type !== "checkbox")
      throw new Error("Expected system prompt checkbox");
    item.onCheckedChange(true);

    expect(onShowSystemPromptChange).toHaveBeenCalledWith(true);
  });

  it("shows the legacy tool-call setting only when provided", () => {
    const onShowInlineToolCallsChange = vi.fn();

    const { result } = renderHook(() =>
      useSessionHeaderMenuItems({
        projectId: "project-id",
        sessionId: "session-id",
        isPublic: false,
        showInlineToolCalls: false,
        showSystemPrompt: false,
        onShowInlineToolCallsChange,
        onShowSystemPromptChange: vi.fn(),
      }),
    );
    const display = result.current.find((item) => item.id === "display");
    expect(display?.type).toBe("submenu");
    if (display?.type !== "submenu")
      throw new Error("Expected Display submenu");
    const item = display.items.find((item) => item.id === "show-tool-calls");
    expect(item).toMatchObject({ type: "checkbox", checked: false });
    if (item?.type !== "checkbox")
      throw new Error("Expected tool calls checkbox");
    item.onCheckedChange(true);

    expect(onShowInlineToolCallsChange).toHaveBeenCalledWith(true);
  });

  it("hides the Display submenu when no display settings are provided", () => {
    const { result } = renderHook(() =>
      useSessionHeaderMenuItems({
        projectId: "project-id",
        sessionId: "session-id",
        isPublic: false,
      }),
    );
    expect(result.current.map((item) => item.id)).not.toContain("display");
  });
});
