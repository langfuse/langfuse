import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { TopicsMapPicker, type UsePreviewTopics } from "./TopicsMapPicker";
import { TopicMapStrip } from "./TopicMapStrip";
import { TopicRuleBuildingState } from "./TopicRuleBuildingState";
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
      filter: [condition("traceName", "support-agent")],
      facetIds: ["issues"],
      status: "completed",
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

/** The Topics page header flow: pick a map, see its strip, or the building state of a new map. */
function MapSwitcher({ initial }: { initial: TopicMapSelection }) {
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
    <div className="flex h-[420px] w-[760px] flex-col rounded-md border">
      <div className="flex items-center gap-3 border-b p-2">
        <TopicsMapPicker
          projectId="project"
          overview={overview}
          selection={selection}
          facetId="intent"
          onSelect={setSelection}
          usePreviewTopics={useStoryPreviewTopics}
          processingOn
          create={{
            map: { onSelect: fn() },
            snapshot: { onSelect: fn() },
          }}
        />
      </div>
      {selectedRule ? (
        <TopicMapStrip.Rule rule={selectedRule} now={now} />
      ) : null}
      {selectedAnalysis ? (
        <TopicMapStrip.Analysis analysis={selectedAnalysis} />
      ) : null}
      {selectedRule?.enabled !== false && selectedRule?.lastRefitAt === null ? (
        <TopicRuleBuildingState rule={selectedRule} />
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    let picker = await openPicker(canvasElement);
    await expect(
      picker.getByRole("button", { name: /Support agent/ }),
    ).toBeVisible();
    await expect(picker.getByText("Snapshots")).toBeVisible();
    await userEvent.click(
      picker.getByRole("button", { name: /Refund complaints/ }),
    );
    await expect(
      canvas.getByRole("button", { name: "Topic map: Refund complaints" }),
    ).toBeVisible();
    await expect(canvas.getByText(/1,840 traces/)).toBeVisible();

    picker = await openPicker(canvasElement);
    await userEvent.click(
      picker.getByRole("button", { name: /Checkout assistant/ }),
    );
    await expect(
      canvas.getByRole("heading", { name: "Building first topics" }),
    ).toBeVisible();
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
