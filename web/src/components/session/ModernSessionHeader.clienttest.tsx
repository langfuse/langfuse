import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("hides and reveals a detail while persisting the preference", async () => {
    const user = userEvent.setup();
    render(<ModernSessionHeader {...defaultProps} />);

    await user.click(
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
        hiddenDetailCount: 1,
        isV4: true,
      },
    );

    await user.click(
      screen.getByRole("button", {
        name: "Show 1 hidden session details",
      }),
    );
    await user.click(
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
  });

  it("restores hidden details from project-scoped local storage", async () => {
    localStorage.setItem(
      sessionHeaderVisibilityStorageKey("project-1"),
      JSON.stringify(["traces"]),
    );
    const user = userEvent.setup();

    render(<ModernSessionHeader {...defaultProps} />);

    expect(
      screen.queryByRole("button", {
        name: "Hide trace and span counts in session header",
      }),
    ).not.toBeInTheDocument();
    await user.click(
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
});
