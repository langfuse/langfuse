import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import {
  TopicsMapPicker,
  type UsePickerCost,
  type UsePreviewTopics,
} from "./TopicsMapPicker";
import { TopicMapStrip } from "./TopicMapStrip";
import { TopicRuleBuildingState } from "./TopicRuleBuildingState";
import { refreshMapDisabledReason } from "./prepare-topics-actions";
import { type TopicMapSelection, type TopicMapsOverview } from "./topic-maps";

const now = Date.parse("2026-11-05T12:00:00.000Z");
const hoursAgo = (hours: number) =>
  new Date(now - hours * 3_600_000).toISOString();
const rule = (
  overrides: Partial<TopicMapsOverview["rules"][number]>,
): TopicMapsOverview["rules"][number] => ({
  id: "rule-all",
  projectId: "project",
  name: "All traces",
  filter: [],
  sampling: 0.1,
  facetIds: ["intent", "issues"],
  enabled: true,
  createdAt: hoursAgo(24 * 30),
  updatedAt: hoursAgo(24 * 30),
  lastRefitAt: hoursAgo(3),
  refresh: { availableAt: null, running: false },
  ...overrides,
});
const condition = (column: string, value: string) => ({
  column,
  type: "string" as const,
  operator: "=" as const,
  value,
});

const overview: TopicMapsOverview = {
  rules: [
    rule({}),
    // Listed before active maps, so the picker's sort is visible.
    rule({
      id: "rule-legacy",
      name: "Legacy RAG",
      filter: [condition("traceName", "rag-v1")],
      enabled: false,
    }),
    rule({
      id: "rule-support",
      name: "Support agent",
      filter: [
        condition("traceName", "support-agent"),
        condition("environment", "production"),
      ],
      sampling: 1,
      lastRefitAt: hoursAgo(26),
      refresh: { availableAt: null, running: true },
    }),
    rule({
      id: "rule-checkout",
      name: "Checkout assistant",
      filter: [condition("traceName", "checkout-assistant")],
      sampling: 0.5,
      lastRefitAt: null,
    }),
  ],
  analyses: [
    {
      id: "analysis-refunds",
      label: "Refund complaints",
      summarize: { limit: 500, selection: "latest" },
      filter: [condition("traceName", "support-agent")],
      facetIds: ["issues"],
      status: "completed",
      updatedAt: hoursAgo(5),
      createdAt: hoursAgo(5),
      timeRange: {
        from: new Date(now - 7 * 86_400_000),
        to: new Date(now),
      },
      traceCount: 1_840,
    },
    {
      id: "analysis-beta",
      label: "Beta users, last 30 days",
      filter: [],
      facetIds: ["intent"],
      status: "running",
      updatedAt: hoursAgo(1),
      createdAt: hoursAgo(1),
      timeRange: {
        from: new Date(now - 30 * 86_400_000),
        to: new Date(now),
      },
      traceCount: 12_400,
    },
  ],
} as TopicMapsOverview;

const ruleMap = (id: string): TopicMapSelection => ({ kind: "rule", id });
const analysisMap = (id: string): TopicMapSelection => ({
  kind: "analysis",
  id,
});

/** The Topics page header flow: pick a map, see its strip, or the building state of a new rule. */
const useStoryPreviewTopics: UsePreviewTopics = (_projectId, map) => ({
  loading: false,
  facets: map
    ? [
        {
          facetId: "intent",
          name: "Intent",
          topics: [
            { id: "a", name: "Schedule candidate meetings", count: 16 },
            { id: "b", name: "Summarize weekly support tickets", count: 15 },
            { id: "c", name: "Plan a city trip itinerary", count: 15 },
            { id: "d", name: "Fix webhook payload parsing", count: 10 },
          ],
        },
      ]
    : undefined,
});

const storyCosts: Record<string, string> = {
  "rule-all": "~$0.32",
  "rule-support": "~$0.14",
  "analysis-refunds": "~$0.50",
  "analysis-beta": "~$0.08",
};
const useStoryPickerCost: UsePickerCost = (_projectId, map) =>
  map ? (storyCosts[map.id] ?? "Unavailable") : "Loading…";

/** The Topics page header flow: pick a map, see its strip, or the building state of a new map. */
function MapSwitcher({
  initial,
  refreshDisabledReason,
  onRefresh,
  onViewRun,
}: {
  initial: TopicMapSelection;
  /** Why a live map can't be refreshed now. */
  refreshDisabledReason?: string;
  onRefresh?: (ruleId: string) => void;
  onViewRun: (executionId: string) => void;
}) {
  const [selection, setSelection] = useState(initial);
  const selectedRule =
    selection.kind === "rule"
      ? overview.rules.find((item) => item.id === selection.id)
      : undefined;
  const selectedAnalysis =
    selection.kind === "analysis"
      ? overview.analyses.find((item) => item.id === selection.id)
      : undefined;
  return (
    <div className="flex h-[420px] w-[min(760px,calc(100vw-2rem))] flex-col rounded-md border">
      <div className="flex items-center gap-3 border-b p-2">
        <TopicsMapPicker
          projectId="project"
          overview={overview}
          selection={selection}
          facetId="intent"
          onSelect={setSelection}
          usePreviewTopics={useStoryPreviewTopics}
          usePickerCost={useStoryPickerCost}
          processingOn
          create={{
            map: { onSelect: fn() },
            snapshot: { onSelect: fn() },
          }}
          refresh={(rule) => ({
            onSelect: () => onRefresh?.(rule.id),
            disabledReason: refreshDisabledReason,
          })}
        />
      </div>
      {selectedRule && <TopicMapStrip.Rule rule={selectedRule} now={now} />}
      {selectedAnalysis && (
        <TopicMapStrip.Analysis
          analysis={selectedAnalysis}
          onViewRun={() => onViewRun(selectedAnalysis.id)}
        />
      )}
      {selectedRule?.enabled !== false && selectedRule?.lastRefitAt === null ? (
        <TopicRuleBuildingState rule={selectedRule} mapBuilt={false} />
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          Topics of the selected map
        </div>
      )}
    </div>
  );
}

const meta = preview.meta({
  component: MapSwitcher,
  parameters: { layout: "centered" },
  args: {
    initial: ruleMap("rule-all"),
    onViewRun: fn(),
  },
});

export default meta;

export const LiveRule = meta.story({});

export const SupportRule = meta.story({
  args: { initial: ruleMap("rule-support") },
});

export const BuildingRule = meta.story({
  args: { initial: ruleMap("rule-checkout") },
});

export const DisabledRule = meta.story({
  args: { initial: ruleMap("rule-legacy") },
});

export const Analysis = meta.story({
  args: { initial: analysisMap("analysis-refunds") },
});

const openPicker = async (canvasElement: HTMLElement) => {
  await userEvent.click(
    within(canvasElement).getByRole("button", { name: /Topic map:/ }),
  );
  const picker = await within(canvasElement.ownerDocument.body).findByRole(
    "dialog",
    { name: "Topic maps" },
  );
  await waitFor(() => expect(picker).toBeVisible());
  return within(picker);
};

export const TestSwitchesMaps = meta.story({
  name: "(Test) Switches between maps and snapshots",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    let picker = await openPicker(canvasElement);
    await expect(
      picker.getByRole("button", { name: /Support agent/ }),
    ).toBeVisible();
    await expect(picker.getByText("Live maps")).toBeVisible();
    await expect(picker.getByText("Snapshots")).toBeVisible();
    await userEvent.click(
      picker.getByRole("button", { name: /Refund complaints/ }),
    );
    await expect(
      canvas.getByRole("button", { name: "Topic map: Refund complaints" }),
    ).toBeVisible();
    await expect(canvas.getByText(/1,840 traces/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "View run" }));
    await expect(args.onViewRun).toHaveBeenCalledWith("analysis-refunds");

    picker = await openPicker(canvasElement);
    await expect(picker.getByText("~$0.50")).toBeVisible();
    await userEvent.click(
      picker.getByRole("button", { name: /Checkout assistant/ }),
    );
    await expect(
      canvas.getByRole("heading", { name: "Building first topics" }),
    ).toBeVisible();
  },
});

export const TestExplainsNewEntries = meta.story({
  name: "(Test) Hovering a create entry explains it",
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement);
    await userEvent.hover(picker.getByRole("button", { name: "New live map" }));
    await expect(
      picker.getByText(/keeps sorting new traces into them/),
    ).toBeVisible();
    await userEvent.hover(picker.getByRole("button", { name: "New snapshot" }));
    await expect(
      picker.getByText(/A snapshot doesn’t change afterwards/),
    ).toBeVisible();
    await userEvent.hover(
      picker.getByRole("button", { name: /Support agent/ }),
    );
    await expect(
      picker.queryByText(/A snapshot doesn’t change afterwards/),
    ).not.toBeInTheDocument();
  },
});

export const TestKeepsHeightWhilePreviewing = meta.story({
  name: "(Test) Keeps its height while previewing",
  play: async ({ canvasElement }) => {
    // The preview pane only shows from the `sm` breakpoint up, wider than Vitest's default viewport.
    const vitestPage =
      "__vitest_browser__" in globalThis
        ? (await import("vitest/browser")).page
        : null;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    await vitestPage?.viewport(1024, 768);
    try {
      const picker = await openPicker(canvasElement);
      // A short list, so the preview pane sets the popover's height.
      await userEvent.type(
        picker.getByRole("searchbox", { name: "Search maps" }),
        "Support",
      );
      const dialog = within(canvasElement.ownerDocument.body).getByRole(
        "dialog",
        { name: "Topic maps" },
      );
      // Exercise wider font metrics consistently across platforms.
      dialog.style.fontFamily = "monospace";
      // The selected live map: three top topics, a one-line filter, and Refresh available.
      await expect(
        picker.getByRole("button", { name: "Refresh" }),
      ).toBeEnabled();
      const height = dialog.getBoundingClientRect().height;
      await userEvent.hover(
        picker.getByRole("button", { name: "New snapshot" }),
      );
      await expect(
        picker.getByText(/A snapshot doesn’t change afterwards/),
      ).toBeVisible();
      await expect(dialog.getBoundingClientRect().height).toBe(height);
    } finally {
      await vitestPage?.viewport(viewport.width, viewport.height);
    }
  },
});

export const TestPausedLast = meta.story({
  name: "(Test) Paused maps sort below active ones",
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement);
    const names = picker
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) =>
        [
          "All traces",
          "Support agent",
          "Checkout assistant",
          "Legacy RAG",
        ].some((name) => text.startsWith(name)),
      )
      .map((text) => text.split(/\d| ·/)[0]!.trim());
    await expect(names.at(-1)).toMatch(/^Legacy RAG/);
  },
});

export const TestRefreshPreviewedMap = meta.story({
  name: "(Test) Cost and refresh follow the previewed map",
  args: { onRefresh: fn() },
  play: async ({ args, canvasElement }) => {
    const picker = await openPicker(canvasElement);
    await expect(picker.getByText("Estimated cost:")).toBeVisible();
    await expect(picker.getByText("~$0.32")).toBeVisible();
    await userEvent.hover(
      picker.getByRole("button", { name: /^Checkout assistant/ }),
    );
    await expect(picker.getByText("Unavailable")).toBeVisible();
    await userEvent.hover(
      picker.getByRole("button", { name: /^Support agent/ }),
    );
    await waitFor(() =>
      expect(
        picker.getByText("Support agent", { selector: ".font-bold" }),
      ).toBeVisible(),
    );
    await expect(picker.getByText("~$0.14")).toBeVisible();
    await userEvent.hover(picker.getByText("~$0.14"));
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toHaveTextContent("Please confirm with your model provider.");
    await userEvent.click(picker.getByRole("button", { name: "Refresh" }));
    await expect(args.onRefresh).toHaveBeenCalledWith("rule-support");
  },
});

export const TestPhoneShowsSelectedMapCost = meta.story({
  name: "(Test) Phone footer keeps the selected map’s cost while browsing",
  globals: { viewport: { value: "phone", isRotated: false } },
  parameters: {
    viewport: {
      options: {
        phone: { name: "Phone", styles: { width: "390px", height: "844px" } },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement);
    await userEvent.hover(
      picker.getByRole("button", { name: /^Support agent/ }),
    );
    await expect(picker.getByText("~$0.32")).toBeVisible();
    await expect(picker.queryByText("~$0.14")).not.toBeInTheDocument();
  },
});

export const TestRefreshCooldown = meta.story({
  name: "(Test) Refresh waits out its cooldown",
  args: {
    refreshDisabledReason: refreshMapDisabledReason({
      canWrite: true,
      state: { status: "on" },
      rule: {
        enabled: true,
        refresh: {
          availableAt: new Date(now + 10 * 60_000).toISOString(),
          running: false,
        },
      },
      setupActive: false,
      now,
    }),
  },
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement);
    // The preview card's top right; phones get a footer entry instead.
    await expect(
      picker.getByRole("button", { name: "Refresh" }),
    ).toBeDisabled();
    // Touch screens show no tooltip, so the reason must be on screen.
    await expect(
      picker.getByText("Refreshed recently. Available again in 10 min.", {
        selector: "p",
      }),
    ).toBeVisible();
  },
});
