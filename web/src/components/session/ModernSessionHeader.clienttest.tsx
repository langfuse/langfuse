import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModernSessionHeader } from "@/src/components/session/ModernSessionHeader";
import { sessionHeaderVisibilityStorageKey } from "@/src/components/session/sessionHeaderVisibility";

const capture = vi.hoisted(() => vi.fn());

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

vi.mock("@/src/components/SingleLineOverflowList", () => ({
  SingleLineOverflowList: ({
    items,
    additionalOverflowCount,
    getKey,
    renderItem,
    renderOverflow,
    trailingContent,
  }: {
    items: readonly { key: string }[];
    additionalOverflowCount: number;
    getKey: (item: { key: string }) => string;
    renderItem: (item: { key: string }) => ReactNode;
    renderOverflow: (props: {
      hiddenItems: readonly { key: string }[];
      overflowItemCount: number;
    }) => ReactNode;
    trailingContent?: ReactNode;
  }) => (
    <div>
      {items.map((item) => (
        <div key={getKey(item)}>{renderItem(item)}</div>
      ))}
      {additionalOverflowCount > 0
        ? renderOverflow({
            hiddenItems: [],
            overflowItemCount: additionalOverflowCount,
          })
        : null}
      {trailingContent}
    </div>
  ),
}));

const defaultProps = {
  projectId: "project-1",
  countTraces: 3,
  traces: {
    state: "loaded" as const,
    data: [{ latencyMs: null, observationCount: 7 }],
  },
  tokensIn: 0,
  tokensOut: 0,
  totalTokens: 0,
  totalCost: 0.12,
  environment: null,
  users: [],
  metadataJsonPaths: {
    paths: [],
    source: { state: "idle" as const },
    onEditorOpenChange: vi.fn(),
    onSave: vi.fn(),
    onRemove: vi.fn(),
  },
  scores: [],
};

describe("ModernSessionHeader", () => {
  afterEach(() => {
    capture.mockClear();
    localStorage.clear();
  });

  it("hides and reveals a detail while persisting the preference", () => {
    render(<ModernSessionHeader {...defaultProps} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Hide trace and span counts in session header",
      }),
    );

    expect(
      screen.queryByRole("button", {
        name: "Hide trace and span counts in session header",
      }),
    ).not.toBeInTheDocument();
    expect(
      localStorage.getItem(sessionHeaderVisibilityStorageKey("project-1")),
    ).toBe(JSON.stringify(["traces"]));
    expect(capture).toHaveBeenCalledWith(
      "session_detail:header_detail_visibility_changed",
      {
        action: "hide",
        detailType: "traces",
        storedHiddenDetailCount: 1,
        isV4: true,
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show 1 hidden session details",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show trace and span counts in session header",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Hide trace and span counts in session header",
      }),
    ).toBeInTheDocument();
    expect(
      localStorage.getItem(sessionHeaderVisibilityStorageKey("project-1")),
    ).toBe(JSON.stringify([]));
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenLastCalledWith(
      "session_detail:header_detail_visibility_changed",
      {
        action: "show",
        detailType: "traces",
        storedHiddenDetailCount: 0,
        isV4: true,
      },
    );
  });

  it("restores hidden details from project-scoped local storage", () => {
    localStorage.setItem(
      sessionHeaderVisibilityStorageKey("project-1"),
      JSON.stringify(["traces"]),
    );
    render(<ModernSessionHeader {...defaultProps} />);

    expect(
      screen.queryByRole("button", {
        name: "Hide trace and span counts in session header",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show 1 hidden session details",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Show trace and span counts in session header",
      }),
    ).toBeInTheDocument();
  });

  it("does not persist customer identifiers in dynamic detail keys", () => {
    const userId = "customer@example.com";
    render(<ModernSessionHeader {...defaultProps} users={[userId]} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Hide user 1 in session header",
      }),
    );

    const storedValue = localStorage.getItem(
      sessionHeaderVisibilityStorageKey("project-1"),
    );
    expect(storedValue).not.toContain(userId);
    expect(JSON.parse(storedValue ?? "[]")).toHaveLength(1);
  });

  it("preserves preferences for details that are temporarily unavailable", () => {
    const storageKey = sessionHeaderVisibilityStorageKey("project-1");
    localStorage.setItem(storageKey, JSON.stringify(["latency"]));
    render(
      <ModernSessionHeader {...defaultProps} traces={{ state: "loading" }} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Hide trace and span counts in session header",
      }),
    );

    expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([
      "latency",
      "traces",
    ]);
  });

  it("lets overflow-only users participate in visibility preferences", () => {
    const users = [
      "user-1@example.com",
      "user-2@example.com",
      "user-3@example.com",
      "user-4@example.com",
    ];
    render(<ModernSessionHeader {...defaultProps} users={users} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show 1 hidden session details",
      }),
    );
    const hideOverflowUser = screen.getByRole("button", {
      name: "Hide user 4 in session header",
    });
    hideOverflowUser.focus();
    fireEvent.click(hideOverflowUser);

    const showOverflowUser = screen.getByRole("button", {
      name: "Show user 4 in session header",
    });
    expect(showOverflowUser).toBeInTheDocument();
    expect(showOverflowUser).toHaveFocus();
    expect(
      localStorage.getItem(sessionHeaderVisibilityStorageKey("project-1")),
    ).not.toContain(users[3]);
  });
});
