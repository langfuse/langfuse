import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModernSessionHeader } from "@/src/features/sessions/ModernSessionHeader";
import {
  modernSessionHeaderScore,
  type ModernSessionHeaderScore,
} from "@/src/features/sessions/__fixtures__/modernSessionHeaderScore";

const capture = vi.hoisted(() => vi.fn());

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

// ScoreBadge reads the project id off the router for its execution-trace link.
vi.mock("next/router", () => ({
  useRouter: () => ({ query: { projectId: "project-1" } }),
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

const scores: ModernSessionHeaderScore[] = [
  modernSessionHeaderScore({
    id: "score-helpfulness",
    name: "Helpfulness",
    value: 0.86,
  }),
];

const defaultProps = {
  projectId: "project-1",
  countTraces: 3,
  traces: {
    state: "loaded" as const,
    data: [{ latencyMs: 1_200, observationCount: 7 }],
  },
  tokensIn: 120,
  tokensOut: 40,
  totalTokens: 160,
  totalCost: 0.12,
  environment: "production",
  users: [],
  metadataJsonPaths: {
    paths: [],
    source: { state: "idle" as const },
    onEditorOpenChange: vi.fn(),
    onSave: vi.fn(),
    onRemove: vi.fn(),
  },
  scores,
};

describe("ModernSessionHeader", () => {
  afterEach(() => {
    capture.mockClear();
  });

  it("renders every session detail as quiet text, links and score chips", () => {
    render(<ModernSessionHeader {...defaultProps} />);

    // Metrics: counts and latency percentiles as plain text, no pill box.
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("traces")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("spans")).toBeInTheDocument();
    // Latency is the median alone; p95 is no longer shown.
    expect(screen.getByTitle("Median trace latency")).toHaveTextContent(
      "p50 1.20s",
    );
    expect(screen.queryByText(/p95/)).not.toBeInTheDocument();
    // Cost and usage share one element.
    expect(screen.getByTitle("Cost")).toBeInTheDocument();
    expect(screen.getByText("160")).toBeInTheDocument();
    // Attributes: env as key:value text.
    expect(screen.getByText("env")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
    // Scores: chips, name and value kept.
    expect(screen.getByText("Helpfulness:")).toBeInTheDocument();
    expect(screen.getByText("0.86")).toBeInTheDocument();
  });

  it("keeps no pill box on metrics, attributes or users", () => {
    const { container } = render(
      <ModernSessionHeader
        {...defaultProps}
        users={["user-1@example.com"]}
        metadataJsonPaths={{
          ...defaultProps.metadataJsonPaths,
          paths: ["$.cloud_region"],
          source: {
            state: "ready" as const,
            metadata: { cloud_region: "EU" },
            metadataTruncated: false,
          },
        }}
      />,
    );

    expect(
      container.querySelectorAll('[data-session-header-pill="true"]'),
    ).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: /^User user-1@example\.com/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("cloud_region")).toBeInTheDocument();
    expect(screen.getByText("EU")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Hide /i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Show .+ in session header$/i }),
    ).not.toBeInTheDocument();
  });

  it("masks user ids from session recordings", () => {
    const { container } = render(
      <ModernSessionHeader {...defaultProps} users={["user-1@example.com"]} />,
    );

    expect(container.querySelector('a[href*="/users/"]')?.className).toContain(
      "ph-no-capture",
    );
  });

  it("keeps the metadata JSONPath remove control and captures the change", () => {
    const onRemove = vi.fn();
    render(
      <ModernSessionHeader
        {...defaultProps}
        metadataJsonPaths={{
          ...defaultProps.metadataJsonPaths,
          paths: ["$.cloud_region"],
          source: {
            state: "ready" as const,
            metadata: { cloud_region: "EU" },
            metadataTruncated: false,
          },
          onRemove,
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove metadata JSONPath $.cloud_region",
      }),
    );

    expect(onRemove).toHaveBeenCalledWith("$.cloud_region");
    expect(capture).toHaveBeenCalledWith(
      "session_detail:metadata_jsonpath_config_changed",
      expect.objectContaining({ action: "remove" }),
    );
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
      screen.getByRole("link", { name: /^User user-4@example\.com/ }),
    ).toBeInTheDocument();
  });
});
