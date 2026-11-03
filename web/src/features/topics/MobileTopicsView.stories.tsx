import { useState, type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/design-system/Button/Button";
import preview from "../../../.storybook/preview";
import { MobileTopicsView } from "./MobileTopicsView";
import { TopicsMobileControls } from "./TopicsMobileControls";

const topics = [
  {
    id: "billing",
    name: "Billing and subscription questions",
    description: "Requests about invoices, refunds, and plan changes.",
    count: 21,
    versionId: "v1",
    runId: "run",
  },
  {
    id: "access",
    name: "Recovering access after changing a company email address",
    description: "Sign-in and account recovery.",
    count: 1,
    versionId: "v2",
    runId: "run",
  },
];
const rows = [
  ...topics.flatMap((topic) =>
    Array.from({ length: topic.count }, (_, index) => ({
      traceId: `${topic.id}-${index}`,
      topicId: topic.id,
      topicName: topic.name,
      summary:
        topic.id === "access"
          ? "The user changed their work email and cannot sign in. They need to recover their workspace without losing their project history."
          : `Invoice question ${index + 1}: the customer needs help understanding a charge and switching their subscription to annual billing.`,
      outcome: "assigned" as const,
      facetVersion: 1,
      unitStartTime: "2026-10-20T12:00:00.000Z",
    })),
  ),
  {
    traceId: "unassigned",
    topicId: null,
    topicName: null,
    summary: "A new request that has not been classified yet.",
    outcome: "awaiting_map" as const,
    facetVersion: 1,
    unitStartTime: "2026-10-20T12:00:00.000Z",
  },
];
const facet: ComponentProps<typeof MobileTopicsView>["facet"] = {
  facetId: "intent",
  name: "Intent",
  facetVersion: 1,
  topics,
  rows,
  map: { runId: "run", topics },
  awaitingCount: 1,
  usableCount: rows.length,
};
const mapResult = {
  error: null,
  data: {
    status: "ready" as const,
    reason: null,
    missingSummaryCount: 0,
    unpositionedCount: 0,
    points: rows.map((row, index) => ({
      ...row,
      outcome: row.topicId ? ("assigned" as const) : ("unassigned" as const),
      x: index % 5,
      y: Math.floor(index / 5),
    })),
  },
};

function MobileExample(args: ComponentProps<typeof MobileTopicsView>) {
  const [view, setView] = useState(args.view);
  const [facetId, setFacetId] = useState(args.facet.facetId);
  const facets = [
    args.facet,
    {
      ...args.facet,
      facetId: "issues",
      name: "Unresolved customer support issues",
      map: args.facet.map && { ...args.facet.map, runId: "other-map" },
    },
  ];
  const facet = facets.find((facet) => facet.facetId === facetId)!;
  const [filters, setFilters] = useState<FilterState>(args.filters);
  const [searchQuery, setSearchQuery] = useState<string | null>(
    args.searchQuery,
  );
  const [selectedTraceId, setSelectedTraceId] = useState(args.selectedTraceId);
  return (
    <div className="flex h-[min(720px,100dvh)] w-full max-w-[390px] flex-col border">
      <div className="shrink-0 border-b p-2">
        <TopicsMobileControls
          facets={facets}
          selectedFacet={facetId}
          onSelectFacet={setFacetId}
          view={view}
          onSelectView={setView}
        />
      </div>
      <MobileTopicsView
        {...args}
        facet={facet}
        view={view}
        filters={filters}
        searchQuery={searchQuery}
        onFiltersChange={setFilters}
        onSearchQueryChange={setSearchQuery}
        selectedTraceId={selectedTraceId}
        onSelectTrace={(traceId) => {
          args.onSelectTrace(traceId);
          setSelectedTraceId(traceId);
        }}
      />
    </div>
  );
}

const defaultArgs: ComponentProps<typeof MobileTopicsView> = {
  projectId: "storybook-topics",
  facet,
  view: "treemap",
  mapResult,
  filters: [],
  searchQuery: null,
  selectedTraceId: null,
  isV4: false,
  onFiltersChange: fn(),
  onSearchQueryChange: fn(),
  onSelectTrace: fn(),
  onOpenTrace: fn(),
  onGenerateTopics: fn(),
  canGenerateTopics: true,
};

const meta = preview.meta({
  component: MobileTopicsView,
  parameters: { layout: "fullscreen" },
  args: defaultArgs,
  render: (args) => <MobileExample {...args} />,
});

export const Default = meta.story({});
export const AwaitingTopics = meta.story({
  args: {
    facet: {
      ...facet,
      topics: [],
      rows: rows.filter((row) => row.topicId === null),
      map: null,
    },
  },
});
export const BrowseAndOpenTrace = meta.story({
  name: "(Test) Reveal selection and browse topics, traces, and pages",
  args: {
    selectedTraceId: "billing-19",
    filters: [
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["billing"],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const selected = canvas.getByRole("button", {
      name: "Open trace billing-19",
    });
    await waitFor(() => {
      const card = selected.getBoundingClientRect();
      const panel = canvas
        .getByRole("region", { name: "Topic traces" })
        .getBoundingClientRect();
      expect(card.top).toBeGreaterThanOrEqual(panel.top);
      expect(card.bottom).toBeLessThanOrEqual(panel.bottom);
    });
    await userEvent.click(canvas.getByRole("tab", { name: "Topics" }));
    await userEvent.click(
      canvas.getByRole("button", { name: `${topics[1].name}, 1 traces` }),
    );
    await expect(canvas.getByRole("tab", { name: "Traces" })).toHaveAttribute(
      "data-state",
      "active",
    );
    const trace = canvas.getByRole("button", { name: "Open trace access-0" });
    await expect(within(trace).getByText(rows[21].summary!)).toBeVisible();
    await userEvent.click(trace);
    await expect(args.onOpenTrace).toHaveBeenCalledWith("access-0");
    await userEvent.click(canvas.getByRole("tab", { name: "Topics" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Unassigned, 1 traces" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Open trace unassigned" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Open trace access-0" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Show all traces" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to next page" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Open trace billing-20" }),
    ).toBeVisible();
    const pagination = within(
      canvas.getByRole("navigation", { name: "Trace pagination" }),
    );
    await userEvent.click(pagination.getByRole("combobox"));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "50",
      }),
    );
    await expect(
      canvas.getAllByRole("button", { name: /^Open trace / }),
    ).toHaveLength(rows.length);
    await expect(pagination.getByRole("combobox")).toBeVisible();
    const search = canvas.getByRole("combobox", { name: "Search" });
    await userEvent.click(search);
    await userEvent.type(search, "no-match");
    await userEvent.keyboard("{Enter}");
    await expect(
      await canvas.findByText("No matches. Adjust or clear your filters."),
    ).toBeVisible();
    await expect(search).toHaveFocus();
  },
});

export const FitFilteredMap = meta.story({
  name: "(Test) Fit and refresh preserve map preview and Unassigned results",
  render: function RefreshableMap(args) {
    const [facet, setFacet] = useState(args.facet);
    return (
      <>
        <Button
          text="Refresh results"
          onClick={() => setFacet({ ...facet, rows: [...facet.rows] })}
        />
        <MobileExample {...args} facet={facet} />
      </>
    );
  },
  args: {
    view: "map",
    filters: [
      {
        column: "assignment",
        type: "stringOptions",
        operator: "none of",
        value: ["assigned"],
      },
    ],
    mapResult: {
      ...mapResult,
      data: {
        ...mapResult.data,
        points: [
          { ...mapResult.data.points[0], x: -10, y: -10 },
          { ...mapResult.data.points[21], x: 10, y: 10 },
          { ...mapResult.data.points[22], x: 0, y: 0 },
        ],
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Visualize" }));
    await userEvent.click(canvas.getByRole("button", { name: "Fit map (0)" }));
    await expect(
      canvas.getByRole("tab", { name: "Visualize" }),
    ).toHaveAttribute("data-state", "active");
    for (
      let attempt = 0;
      attempt < 12 &&
      canvas.queryAllByRole("button", { name: /^Select trace:/ }).length === 0;
      attempt++
    ) {
      await userEvent.click(
        canvas.getByRole("button", { name: "Zoom in (+)" }),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    }
    const trace = await canvas.findByRole("button", { name: /^Select trace:/ });
    await userEvent.click(trace);
    await expect(
      canvas.getByRole("tab", { name: "Visualize" }),
    ).toHaveAttribute("data-state", "active");
    await waitFor(() =>
      expect(
        canvas.getByRole("tooltip", { name: /^Trace summary:/ }),
      ).toBeVisible(),
    );
    await expect(args.onSelectTrace).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh results" }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await expect(
      canvas.getByRole("tooltip", { name: /^Trace summary:/ }),
    ).toBeVisible();
    await userEvent.click(trace);
    await expect(
      canvas.getByRole("button", { name: "Open trace unassigned" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Open trace billing-0" }),
    ).not.toBeInTheDocument();
    await expect(args.onOpenTrace).not.toHaveBeenCalled();
  },
});

export const PreviewTreemap = meta.story({
  name: "(Test) Tap a topic to preview, tap again to browse its traces",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Visualize" }));
    const billing = canvas.getByRole("button", {
      name: `${topics[0].name}, 21 traces`,
    });
    const access = canvas.getByRole("button", {
      name: `${topics[1].name}, 1 traces`,
    });
    await userEvent.click(billing);
    await expect(
      canvas.getByRole("tab", { name: "Visualize" }),
    ).toHaveAttribute("data-state", "active");
    await expect(canvas.getByRole("tooltip")).toHaveTextContent(
      topics[0].description,
    );
    await userEvent.click(access);
    await expect(canvas.getByRole("tooltip")).toHaveTextContent(topics[1].name);
    await userEvent.click(access);
    const trace = canvas.getByRole("button", { name: "Open trace access-0" });
    await expect(trace).toBeVisible();
    await expect(args.onOpenTrace).not.toHaveBeenCalled();
  },
});

export const PreviewGrid = meta.story({
  name: "(Test) Preview grid items, select traces, and clear topics",
  args: {
    filters: [
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["billing"],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Topics view" }),
    );
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "Grid",
      }),
    );
    const grid = await canvas.findByRole("img", { name: /^Topic grid/ });
    const dot = grid.querySelector('[data-trace-id="access-0"]')!;
    await userEvent.click(dot);
    await expect(canvas.getByRole("tooltip")).toHaveTextContent(
      rows[21].summary!,
    );
    await expect(
      canvas.getByRole("tab", { name: "Visualize" }),
    ).toHaveAttribute("data-state", "active");
    await expect(args.onSelectTrace).not.toHaveBeenCalled();
    await userEvent.click(dot);
    const trace = canvas.getByRole("button", { name: "Open trace access-0" });
    await expect(trace).toHaveAttribute("aria-current", "true");
    await userEvent.click(canvas.getByRole("tab", { name: "Visualize" }));
    const topic = canvas.getByRole("button", {
      name: /Billing and subscription questions/,
    });
    await userEvent.click(topic);
    await expect(canvas.getByRole("tooltip")).toHaveTextContent(
      topics[0].description,
    );
    await userEvent.click(topic);
    await userEvent.click(canvas.getByRole("tab", { name: "Visualize" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Show all topics" }),
    );
    await expect(
      canvas.getByRole("tab", { name: "Visualize" }),
    ).toHaveAttribute("data-state", "active");
    await expect(
      canvas.getByRole("button", { name: "Show all topics" }),
    ).toBeDisabled();
    await expect(args.onOpenTrace).not.toHaveBeenCalled();
  },
});

export const SwitchPublishedMap = meta.story({
  name: "(Test) Switching facet maps resets the camera and keeps Visualize open",
  args: { view: "map" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Visualize" }));
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in (+)" }));
    await expect(canvas.queryByText("100%")).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Topics facet" }),
    );
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "Unresolved customer support issues",
      }),
    );
    await expect(await canvas.findByText("100%")).toBeVisible();
    await expect(
      canvas.getByRole("tab", { name: "Visualize" }),
    ).toHaveAttribute("data-state", "active");
  },
});
