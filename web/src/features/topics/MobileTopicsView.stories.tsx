import { useState, type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/design-system/Button/Button";
import { PINCH_ZOOM_RATE } from "@/src/utils/panZoomGestures";
import preview from "../../../.storybook/preview";
import { MobileTopicsView } from "./MobileTopicsView";
import { PAGE_SIZE } from "./TopicMobileTraceList";
import { TopicsMobileControls } from "./TopicsMobileControls";
import { prepareTopicsActions } from "./prepare-topics-actions";
import {
  staticTopicTraces,
  storyFacet,
} from "@/.storybook/fixtures/topic-story-traces";

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
const facet = storyFacet(
  {
    facetId: "intent",
    name: "Intent",
    facetVersion: 1,
    topics,
    map: { runId: "run", topics },
  },
  rows,
);
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
        />
      </div>
      <MobileTopicsView
        {...args}
        facet={facet}
        view={view}
        onViewChange={(nextView) => {
          args.onViewChange(nextView);
          setView(nextView);
        }}
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

const mapActionHandlers = {
  onEditRun: fn(),
  onNewMap: fn(),
  onNewSnapshot: fn(),
};
const mapActions = prepareTopicsActions({
  automaticProcessing: { state: { status: "on" }, saving: false },
  canWrite: true,
  configureAvailable: true,
  onConfigure: fn(),
  onHistory: fn(),
  ...mapActionHandlers,
  mapPickerShown: true,
  showUnassigned: true,
  onShowUnassignedChange: fn(),
});

const defaultArgs: ComponentProps<typeof MobileTopicsView> = {
  projectId: "storybook-topics",
  facet,
  view: "treemap",
  onViewChange: fn(),
  mapResult,
  filters: [],
  searchQuery: null,
  selectedTraceId: null,
  isV4: false,
  onFiltersChange: fn(),
  onSearchQueryChange: fn(),
  onSelectTrace: fn(),
  onOpenTrace: fn(),
  useTraces: staticTopicTraces(rows),
  showUnassigned: true,
  mapActions,
};

const meta = preview.meta({
  component: MobileTopicsView,
  parameters: { layout: "fullscreen" },
  args: defaultArgs,
  render: (args) => <MobileExample {...args} />,
});

export const Default = meta.story({});
export const SwitchVisualization = meta.story({
  name: "(Test) Switch visualization within its panel",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.queryByRole("combobox", { name: "Visualization" }),
    ).not.toBeInTheDocument();
    const tab = canvas.getByRole("tab", { name: "Visualize" });
    await userEvent.click(tab);
    await expect(tab).not.toHaveAttribute("aria-haspopup");
    const selector = canvas.getByRole("combobox", { name: "Visualization" });
    await expect(selector).toHaveTextContent("Treemap");
    await userEvent.click(selector);
    await userEvent.click(await body.findByRole("option", { name: "Scatter" }));
    await expect(args.onViewChange).toHaveBeenCalledWith("map");
    await userEvent.click(canvas.getByRole("tab", { name: "Topics" }));
    await expect(
      canvas.queryByRole("combobox", { name: "Visualization" }),
    ).not.toBeInTheDocument();
  },
});
export const AwaitingTopics = meta.story({
  args: {
    facet: storyFacet(
      { ...facet, topics: [], map: null },
      rows.filter((row) => row.topicId === null),
    ),
    useTraces: staticTopicTraces(rows.filter((row) => row.topicId === null)),
  },
});
export const MapEntryPointsWithoutTopics = meta.story({
  name: "(Test) Offer the map entry points under an empty topic list",
  args: {
    facet: storyFacet(
      { ...facet, topics: [], map: null },
      rows.filter((row) => row.topicId === null),
    ),
    useTraces: staticTopicTraces(rows.filter((row) => row.topicId === null)),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const [label, handler] of [
      ["Edit map", mapActionHandlers.onEditRun],
      ["New map", mapActionHandlers.onNewMap],
      ["New snapshot", mapActionHandlers.onNewSnapshot],
    ] as const) {
      await userEvent.click(await canvas.findByRole("button", { name: label }));
      await expect(handler).toHaveBeenCalledOnce();
    }
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
    await expect(
      canvas.getByRole("button", { name: "Open trace access-0" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open trace billing-20" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to previous page" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Open trace billing-0" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Open trace access-0" }),
    ).not.toBeInTheDocument();
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
        <Button text="Refresh results" onClick={() => setFacet({ ...facet })} />
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
    await userEvent.click(
      canvas.getByRole("button", { name: "Fit scatter (0)" }),
    );
    await expect(
      canvas.getByRole("tab", { name: "Visualize" }),
    ).toHaveAttribute("data-state", "active");
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    // Dots stay dots, so a tap on the centered dot previews its trace.
    const stage = canvas.getByRole("group", { name: /^Interactive scatter/ });
    const tapCenter = () => {
      const rect = stage.getBoundingClientRect();
      stage.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
    };
    tapCenter();
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
    tapCenter();
    await expect(
      await canvas.findByRole("button", { name: "Open trace unassigned" }),
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

export const PreviewZoomedTreemap = meta.story({
  name: "(Test) A zoomed treemap previews inside the visible area",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Visualize" }));
    const billing = canvas.getByRole("button", {
      name: `${topics[0].name}, 21 traces`,
    });
    const scroller = canvas.getByRole("region", { name: "Topics" })
      .parentElement as HTMLElement;
    const before = billing.getBoundingClientRect().height;
    billing.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        // Two zoom levels: four times the treemap height.
        deltaY: -2 / PINCH_ZOOM_RATE,
      }),
    );
    await waitFor(() =>
      expect(billing.getBoundingClientRect().height).toBeGreaterThan(
        before * 3,
      ),
    );
    scroller.scrollTop = 0;
    await userEvent.click(billing);
    const visible = scroller.getBoundingClientRect();
    const preview = (
      await canvas.findByRole("tooltip")
    ).getBoundingClientRect();
    await expect(preview.top).toBeGreaterThanOrEqual(visible.top);
    await expect(preview.top).toBeLessThan(visible.bottom);
  },
});

export const PickFilteredPointBeyondPage = meta.story({
  name: "(Test) Picking a filtered point beyond the loaded page keeps the filter",
  args: {
    view: "map",
    filters: [
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["billing"],
      },
    ],
    useTraces: staticTopicTraces(rows, 1),
    // billing-5 sits at the center; the page holds only billing-0.
    mapResult: {
      ...mapResult,
      data: {
        ...mapResult.data,
        points: [
          { ...mapResult.data.points[0], x: -10, y: -10 },
          { ...mapResult.data.points[1], x: 10, y: 10 },
          { ...mapResult.data.points[5], x: 0, y: 0 },
        ],
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Visualize" }));
    const stage = await canvas.findByRole("group", {
      name: /^Interactive scatter/,
    });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const tapCenter = () => {
      const rect = stage.getBoundingClientRect();
      stage.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
    };
    tapCenter();
    await waitFor(() =>
      expect(
        canvas.getByRole("tooltip", { name: /^Trace summary:/ }),
      ).toBeVisible(),
    );
    tapCenter();
    const trace = await canvas.findByRole("button", {
      name: "Open trace billing-5",
    });
    await expect(trace).toHaveAttribute("aria-current", "true");
    await expect(
      canvas.getByRole("heading", { name: topics[0].name }),
    ).toBeVisible();
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

export const KeepPageAfterRefresh = meta.story({
  name: "(Test) Keep the page when a refresh moves the selected trace",
  render: function KeepPageAfterRefresh(args) {
    const [shifted, setShifted] = useState(false);
    const source = shifted
      ? [
          {
            traceId: "newer-0",
            topicId: "billing",
            topicName: topics[0].name,
            summary: "A newer invoice question sorted ahead of the selection.",
            outcome: "assigned" as const,
            facetVersion: 1,
            unitStartTime: "2026-10-21T12:00:00.000Z",
          },
          ...rows,
        ]
      : rows;
    return (
      <>
        <Button text="Refresh traces" onClick={() => setShifted(true)} />
        <MobileExample
          {...args}
          selectedTraceId={rows[PAGE_SIZE - 1]!.traceId}
          useTraces={staticTopicTraces(source)}
        />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selectedName = `Open trace ${rows[PAGE_SIZE - 1]!.traceId}`;
    await userEvent.click(canvas.getByRole("tab", { name: "Traces" }));
    await expect(
      canvas.getByRole("button", { name: `Open trace ${rows[0].traceId}` }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: selectedName }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh traces" }),
    );
    await expect(
      canvas.getByRole("button", { name: `Open trace ${rows[0].traceId}` }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: selectedName }),
    ).not.toBeInTheDocument();
  },
});
