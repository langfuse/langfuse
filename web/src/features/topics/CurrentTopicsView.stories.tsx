import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { CurrentTopicsView } from "./CurrentTopicsView";
import {
  fitCamera,
  prepareTopicMap,
  screenPoint,
} from "./map/prepare-topic-map";

const topic = {
  id: "billing",
  versionId: "billing-v1",
  runId: "run",
  name: "Billing questions",
  description: "Invoice support",
  count: 60,
};
const rows = Array.from({ length: 120 }, (_, index) => ({
  traceId: `trace-${index}`,
  summary: index >= 60 ? `Invoice refund ${index}` : `Account setup ${index}`,
  topicId: index % 2 === 0 ? "billing" : null,
  topicName: index % 2 === 0 ? "Billing questions" : null,
  outcome: index % 2 === 0 ? "assigned" : "outlier",
  facetVersion: 1,
  unitStartTime: "2026-10-01T00:00:00.000Z",
}));
const facet = {
  facetId: "intent",
  name: "Intent",
  facetVersion: 1,
  rows,
  topics: [topic],
  map: { runId: "run", topics: [topic] },
  awaitingCount: 0,
  usableCount: rows.length,
};
const mapData = {
  status: "ready" as const,
  reason: null,
  points: [0, 60, 61, 119].map((index, position) => ({
    traceId: rows[index].traceId,
    summary: rows[index].summary,
    topicId: rows[index].topicId,
    outcome: index % 2 === 0 ? ("assigned" as const) : ("outlier" as const),
    x: [0, 1, -1, 0][position],
    y: [0, 1, 1, -1][position],
  })),
  missingSummaryCount: 0,
  unpositionedCount: 0,
};

const defaultArgs: ComponentProps<typeof CurrentTopicsView> = {
  projectId: "storybook-topics",
  facet,
  mapResult: { data: mapData, error: null },
  traceFilters: {
    filters: [],
    setFilters: fn(),
    searchQuery: null,
    setSearchQuery: fn(),
  },
  onOpenTrace: fn(),
  onGenerateTopics: fn(),
  canGenerateTopics: true,
  peekView: {
    itemType: "TRACE",
    tableName: "topics-current-traces",
    isV4: false,
    closePeek: fn(),
  },
};

const meta = preview.meta({
  component: CurrentTopicsView,
  args: defaultArgs,
  render: (args) => <ControlledTopics {...args} />,
  beforeEach: () => {
    sessionStorage.removeItem("topics-selected-trace:storybook-topics");
    return () =>
      sessionStorage.removeItem("topics-selected-trace:storybook-topics");
  },
});

export const Default = meta.story({});

export const LongTopicNames = meta.story({
  args: {
    facet: {
      ...facet,
      topics: [
        { ...topic, name: "Unresolved issue handling failures" },
        {
          ...topic,
          id: "results",
          name: "Unsupported or incomplete final task results",
        },
      ],
      rows: [
        {
          ...rows[0],
          topicName: "Unresolved issue handling failures",
          summary:
            "The troubleshooting step claimed success without verifying that sending messages worked.",
        },
        {
          ...rows[1],
          topicId: "results",
          topicName: "Unsupported or incomplete final task results",
          outcome: "assigned",
        },
        { ...rows[2], topicId: null, topicName: null, outcome: "outlier" },
        {
          ...rows[3],
          topicId: null,
          topicName: null,
          outcome: "insufficient_input",
          summary: "",
        },
      ],
    },
  },
});

export const FilteringResetsPagination = meta.story({
  name: "(Test) Filtering Resets Pagination and Shares Map Matches",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const table = within(canvas.getByRole("region", { name: "Topic traces" }));
    await userEvent.click(table.getByRole("combobox", { name: "" }));
    await userEvent.click(body.getByRole("option", { name: "50" }));
    await userEvent.click(
      table.getByRole("button", { name: "Go to next page" }),
    );
    await expect(table.getByRole("link", { name: "trace-50" })).toBeVisible();
    const search = table.getByRole("combobox", { name: "Search" });
    await replaceQuery(search, "invoice");
    await waitFor(() => {
      expect(table.getByRole("status")).toHaveTextContent("60 of 120 traces");
      expect(table.getByRole("link", { name: "trace-60" })).toBeVisible();
    });
    await expect(
      canvas.getByRole("button", {
        name: "Map coverage: 3 of 4 mapped traces match",
      }),
    ).toBeVisible();
    await userEvent.click(
      table.getByRole("button", { name: "Go to next page" }),
    );
    await expect(table.getByRole("link", { name: "trace-110" })).toBeVisible();
    await replaceQuery(search, "");
    await waitFor(() =>
      expect(table.getByRole("status")).toHaveTextContent("120 of 120 traces"),
    );
    await expect(table.getByRole("link", { name: "trace-0" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Map coverage: 4 mapped traces" }),
    ).toBeVisible();
    await userEvent.click(
      table.getByRole("button", { name: "Go to next page" }),
    );
    await expect(table.getByRole("link", { name: "trace-50" })).toBeVisible();
    const groups = within(canvas.getByRole("region", { name: "Topic groups" }));
    await userEvent.click(
      groups.getByRole("button", { name: /Billing questions/ }),
    );
    await waitFor(() => {
      expect(table.getByRole("status")).toHaveTextContent("60 of 120 traces");
      expect(table.getByRole("link", { name: "trace-0" })).toBeVisible();
    });
    await expect(
      canvas.getByRole("button", {
        name: "Map coverage: 2 of 4 mapped traces match",
      }),
    ).toBeVisible();
  },
});

export const EquivalentMatchesPreserveHoverAndFocus = meta.story({
  name: "(Test) Equivalent Matches Preserve Hover and Focus",
  args: {
    traceFilters: {
      ...defaultArgs.traceFilters,
      filters: [
        {
          column: "topicId",
          type: "stringOptions",
          operator: "any of",
          value: ["billing"],
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", { name: /^Interactive topic map/ });
    await waitFor(() =>
      expect(stage.getBoundingClientRect().height).toBeGreaterThan(0),
    );
    const model = prepareTopicMap(mapData, [topic]);
    const rect = stage.getBoundingClientRect();
    const size = { width: rect.width, height: rect.height };
    const camera = fitCamera(model.bounds, model.bounds, size);
    const point = model.pointById.get("trace-0")!;
    const at = screenPoint(point, camera, model.bounds, size);
    let attempt = 0;
    await waitFor(() => {
      stage.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          clientX: rect.left + at.x + (attempt++ % 2 ? 1 : -1),
          clientY: rect.top + at.y,
        }),
      );
      expect(
        canvasElement.querySelector(
          '[role="tooltip"][data-active="true"][data-trace-id="trace-0"]',
        ),
      ).not.toBeNull();
    });
    const refresh = canvas.getByRole("button", {
      name: "Refresh unchanged results",
    });
    refresh.click();
    await afterPaint();
    await expect(
      canvasElement.querySelector(
        '[role="tooltip"][data-active="true"][data-trace-id="trace-0"]',
      ),
    ).not.toBeNull();
    for (
      let attempt = 0;
      attempt < 16 &&
      canvas.queryAllByRole("button", { name: /^Select trace:/ }).length === 0;
      attempt++
    ) {
      await userEvent.click(
        canvas.getByRole("button", { name: "Zoom in (+)" }),
      );
      await afterPaint();
    }
    const card = (
      await canvas.findAllByRole("button", { name: /^Select trace:/ })
    )[0];
    card.focus();
    card.click();
    await afterPaint();
    await expect(card).toHaveFocus();
    refresh.click();
    await afterPaint();
    await expect(card).toHaveFocus();
    await expect(card.isConnected).toBe(true);
  },
});

function ControlledTopics(args: ControlledTopicsProps) {
  const [filters, setFilters] = useState(args.traceFilters.filters);
  const [searchQuery, setSearchQuery] = useState(args.traceFilters.searchQuery);
  const [revision, setRevision] = useState(0);
  function refresh() {
    setRevision((previous) => previous + 1);
  }
  return (
    <div className="flex h-[800px] flex-col gap-2">
      <Button
        text="Refresh unchanged results"
        variant="secondary"
        onClick={refresh}
      />
      <CurrentTopicsView
        {...args}
        facet={{
          ...args.facet,
          rows: (revision % 2
            ? [...args.facet.rows].reverse()
            : args.facet.rows
          ).map((row) => ({ ...row })),
        }}
        traceFilters={{
          ...args.traceFilters,
          filters: filters.map((filter) => ({ ...filter })),
          setFilters,
          searchQuery,
          setSearchQuery,
        }}
      />
    </div>
  );
}

async function replaceQuery(search: HTMLElement, query: string) {
  await userEvent.click(search);
  await userEvent.clear(search);
  if (query) await userEvent.type(search, query);
  await userEvent.keyboard("{Enter}");
}

async function afterPaint() {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

type ControlledTopicsProps = ComponentProps<typeof CurrentTopicsView>;

export const SummariesWithoutTopics = meta.story({
  name: "(Test) Summaries without topics open generation",
  args: {
    facet: {
      ...facet,
      map: null,
      topics: [],
      rows: rows.map((row) => ({
        ...row,
        topicId: null,
        topicName: null,
        outcome: "awaiting_map",
      })),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("region", { name: "Topic traces" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Generate topics" }),
    );
    await expect(args.onGenerateTopics).toHaveBeenCalledOnce();
  },
});

export const ExistingTopicsWithoutAssignments = meta.story({
  name: "(Test) Empty range keeps existing topics without prompting regeneration",
  args: { facet: { ...facet, topics: [], rows: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Generate topics" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("region", { name: "Topic traces" }),
    ).toBeVisible();
  },
});

export const PanelSizesPersistAcrossFacetsAndLayouts = meta.story({
  name: "(Test) Panel sizes persist across facets and layouts",
  beforeEach: resetPanelSizes,
  render: function Render(args) {
    const [facetId, setFacetId] = useState("intent");
    function switchFacet() {
      setFacetId((previous) =>
        previous === "intent" ? "sentiment" : "intent",
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <Button text="Switch facet" onClick={switchFacet} />
        <ControlledTopics
          key={facetId}
          {...args}
          facet={{ ...args.facet, facetId }}
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    if (!("__vitest_browser__" in globalThis)) return;

    const { page } = await import("vitest/browser");
    const originalViewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const canvas = within(canvasElement);
    function panelSizes() {
      return canvas
        .getAllByRole("separator", { name: /^Resize topic/ })
        .map((divider) => divider.getAttribute("aria-valuenow"));
    }
    async function resizePanel(name: string, key: string) {
      canvas.getByRole("separator", { name }).focus();
      await userEvent.keyboard(key);
    }
    async function switchFacet() {
      await userEvent.click(
        canvas.getByRole("button", { name: "Switch facet" }),
      );
    }
    try {
      await page.viewport(1280, 900);
      await resizePanel("Resize topic overview and traces", "{ArrowRight}");
      await resizePanel("Resize topic map and groups", "{ArrowDown}");
      const desktopSizes = panelSizes();
      await switchFacet();
      await waitFor(() => expect(panelSizes()).toEqual(desktopSizes));

      await page.viewport(700, 900);
      await canvas.findByRole("tab", { name: "Topics" });
      await resizePanel("Resize topic map and groups", "{ArrowUp}");
      const narrowSizes = panelSizes();
      await switchFacet();
      await waitFor(() => expect(panelSizes()).toEqual(narrowSizes));

      await page.viewport(1280, 900);
      await waitFor(() => expect(panelSizes()).toEqual(desktopSizes));
      await page.viewport(700, 900);
      await waitFor(() => expect(panelSizes()).toEqual(narrowSizes));
    } finally {
      await page.viewport(originalViewport.width, originalViewport.height);
    }
  },
});

function resetPanelSizes() {
  const keys = [
    "react-resizable-panels:topics-workspace-size:overview:traces",
    "react-resizable-panels:topics-overview-size:map:groups",
    "react-resizable-panels:topics-overview-size-narrow:map:groups",
  ];
  keys.forEach((key) => localStorage.removeItem(key));
  return () => keys.forEach((key) => localStorage.removeItem(key));
}

export const TraceSelectionAcrossFacets = meta.story({
  name: "(Test) Map selection follows traces across facets without opening peek",
  args: {
    peekView: { ...defaultArgs.peekView, openPeek: fn() },
  },
  render: function Render(args) {
    const [facetId, setFacetId] = useState("intent");
    function switchFacet() {
      setFacetId((value) => (value === "intent" ? "sentiment" : "intent"));
    }
    return (
      <div>
        <Button text="Switch facet" onClick={switchFacet} />
        <ControlledTopics
          key={facetId}
          {...args}
          facet={{
            ...args.facet,
            facetId,
            rows: [...args.facet.rows].reverse(),
          }}
        />
      </div>
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const stage = canvas.getByRole("group", { name: /^Interactive topic map/ });
    await waitFor(() =>
      expect(stage.getBoundingClientRect().height).toBeGreaterThan(0),
    );
    const model = prepareTopicMap(mapData, [topic]);
    const rect = stage.getBoundingClientRect();
    const size = { width: rect.width, height: rect.height };
    const camera = fitCamera(model.bounds, model.bounds, size);
    const at = screenPoint(
      model.pointById.get("trace-0")!,
      camera,
      model.bounds,
      size,
    );
    function clickMap(x = at.x, y = at.y) {
      const map = canvas.getByRole("group", { name: /^Interactive topic map/ });
      const bounds = map.getBoundingClientRect();
      map.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: bounds.left + x,
          clientY: bounds.top + y,
        }),
      );
    }
    await afterPaint();
    clickMap();
    await expect(args.onOpenTrace).not.toHaveBeenCalled();
    await waitFor(() => {
      const row = canvas.getByRole("link", { name: "trace-0" }).closest("tr")!;
      expect(row).toHaveAttribute("aria-selected", "true");
      const panel = canvas.getByRole("region", { name: "Topic traces" });
      expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        panel.getBoundingClientRect().bottom,
      );
      expect(
        JSON.parse(
          sessionStorage.getItem("topics-selected-trace:storybook-topics")!,
        ),
      ).toBe("trace-0");
    });
    const refresh = canvas.getByRole("button", {
      name: "Refresh unchanged results",
    });
    await userEvent.click(refresh);
    await expect(
      canvas.getByRole("link", { name: "trace-0" }).closest("tr"),
    ).toHaveAttribute("aria-selected", "true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to next page" }),
    );
    await userEvent.click(refresh);
    await expect(canvas.getByRole("link", { name: "trace-99" })).toBeVisible();
    clickMap();
    await waitFor(() =>
      expect(canvas.getByRole("link", { name: "trace-0" })).toBeVisible(),
    );
    clickMap(5, 5);
    await waitFor(() =>
      expect(
        canvas.getByRole("link", { name: "trace-0" }).closest("tr"),
      ).not.toHaveAttribute("aria-selected"),
    );
    clickMap();
    await userEvent.click(canvas.getByRole("button", { name: "Switch facet" }));
    await expect(
      canvas.getByRole("link", { name: "trace-0" }).closest("tr"),
    ).toHaveAttribute("aria-selected", "true");
    for (
      let attempt = 0;
      attempt < 16 &&
      !canvas.queryByRole("button", {
        name: /^Select trace:.*Account setup 0/,
      });
      attempt++
    ) {
      await userEvent.click(
        canvas.getByRole("button", { name: "Zoom in (+)" }),
      );
      await afterPaint();
    }
    const selected = canvas.getByRole("button", {
      name: /^Select trace:.*Account setup 0/,
    });
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(selected);
    await expect(args.onOpenTrace).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("link", { name: "trace-0" }));
    await expect(args.onOpenTrace).toHaveBeenCalledOnce();
    await expect(args.onOpenTrace).toHaveBeenCalledWith("trace-0");
    await userEvent.click(canvas.getByText("Account setup 1"));
    await expect(args.peekView.openPeek).toHaveBeenCalledOnce();
    await expect(
      canvas.getByRole("link", { name: "trace-1" }).closest("tr"),
    ).toHaveAttribute("aria-selected", "true");
    const search = canvas.getByRole("combobox", { name: "Search" });
    await replaceQuery(search, "invoice");
    await waitFor(() =>
      expect(
        canvas.queryByRole("link", { name: "trace-0" }),
      ).not.toBeInTheDocument(),
    );
    clickMap();
    await afterPaint();
    await expect(
      sessionStorage.getItem("topics-selected-trace:storybook-topics"),
    ).toBe(JSON.stringify("trace-1"));
    await replaceQuery(search, "");
    await waitFor(() =>
      expect(
        canvas.getByRole("link", { name: "trace-1" }).closest("tr"),
      ).toHaveAttribute("aria-selected", "true"),
    );
  },
});
