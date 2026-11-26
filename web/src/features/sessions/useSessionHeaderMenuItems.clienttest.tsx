import { renderHook } from "@testing-library/react";
import { vi } from "vitest";

import { useSessionHeaderMenuItems } from "@/src/features/sessions/useSessionHeaderMenuItems";

const { mockUseInternalFeaturesEnabled, copy, getShareUrl, publish } =
  vi.hoisted(() => ({
    mockUseInternalFeaturesEnabled: vi.fn(),
    copy: vi.fn(),
    getShareUrl: vi.fn(() => "https://example.com"),
    publish: { sharingDisabledReason: null as string | null },
  }));

vi.mock(
  "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled",
  () => ({
    useInternalFeaturesEnabled: mockUseInternalFeaturesEnabled,
  }),
);

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/", push: vi.fn() }),
}));

vi.mock("@/src/components/usePublishObject", () => ({
  getShareUrl,
  usePublishObject: () => ({
    hasAccess: true,
    isPending: false,
    sharingDisabledReason: publish.sharingDisabledReason,
    toggle: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy }),
}));

vi.mock("@/src/utils/clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

describe("useSessionHeaderMenuItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInternalFeaturesEnabled.mockReturnValue(false);
    publish.sharingDisabledReason = null;
  });

  it("copies the session URL override rather than the surrounding trace URL", () => {
    const shareUrl = "/project/project-id/sessions/session-id";
    const { result } = renderHook(() =>
      useSessionHeaderMenuItems({
        projectId: "project-id",
        sessionId: "session-id",
        isPublic: true,
        shareUrl,
      }),
    );
    const item = result.current.find((item) => item.id === "copy-share-link");
    if (item?.type !== "item") throw new Error("Expected share link action");
    item.onClick?.();
    expect(getShareUrl).toHaveBeenCalledWith(shareUrl);
  });

  it("keeps Unshare available for a public session while sharing is disabled", () => {
    publish.sharingDisabledReason =
      "Public sharing is disabled for this organization.";
    const { result } = renderHook(() =>
      useSessionHeaderMenuItems({
        projectId: "project-id",
        sessionId: "session-id",
        isPublic: true,
      }),
    );
    const ids = result.current.map((item) => item.id);
    expect(ids).not.toContain("copy-share-link");
    expect(ids).not.toContain("share");
    expect(result.current.find((item) => item.id === "unshare")).toMatchObject({
      type: "item",
      disabled: undefined,
    });
  });

  it.each(["events_full", "events_core"])(
    "copies all session rows from %s with escaped identifiers",
    async (table) => {
      mockUseInternalFeaturesEnabled.mockReturnValue(true);
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

  it("hides query copying without internal features", () => {
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
  });

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
