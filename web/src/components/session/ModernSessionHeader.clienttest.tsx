import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModernSessionHeader } from "@/src/components/session/ModernSessionHeader";

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
  });

  it("renders every session detail chip without a hide control", () => {
    const { container } = render(<ModernSessionHeader {...defaultProps} />);

    expect(
      container.querySelectorAll('[data-session-header-pill="true"]').length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /^Hide /i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Show .+ in session header$/i }),
    ).not.toBeInTheDocument();
  });

  it("does not capture a header detail visibility event", () => {
    render(<ModernSessionHeader {...defaultProps} />);

    expect(capture).not.toHaveBeenCalledWith(
      "session_detail:header_detail_visibility_changed",
      expect.anything(),
    );
  });

  it("keeps overflow users reachable through the overflow popover", () => {
    const users = [
      "user-1@example.com",
      "user-2@example.com",
      "user-3@example.com",
      "user-4@example.com",
    ];
    render(<ModernSessionHeader {...defaultProps} users={users} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show 1 more session details",
      }),
    );

    expect(
      screen.getByRole("link", { name: "user user-4@example.com" }),
    ).toBeInTheDocument();
  });
});
