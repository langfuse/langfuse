import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicTreemapView } from "./TopicTreemapView";

const counts = [55, 45, 27, 23, 21, 20, 20, 18, 17, 16, 15, 15, 14, 14, 13];
const names = [
  "Langfuse user assistance",
  "Dashboard widget management",
  "Trace analysis title requests",
  "Trace and observation filtering",
  "Trace cost analysis",
  "Conversation title generation",
  "Human evaluation workflow",
  "LLM-as-a-judge evaluator setup",
  "Failure analysis and prioritization",
  "Langfuse session and trace review",
  "Weekly cost comparisons",
  "Failed trace error analysis",
  "Trace performance review",
  "Langfuse trace export",
  "Recommendation requests",
];
const topics = names.map((name, index) => ({
  id: `topic-${index}`,
  name,
  description: "",
  count: counts[index],
}));
const rows = topics.flatMap((topic) =>
  Array.from({ length: topic.count }, (_, index) => ({
    traceId: `${topic.id}-trace-${index}`,
    summary: `${topic.name} question ${index + 1}`,
    topicId: topic.id,
    topicName: topic.name,
    outcome: "assigned" as const,
    facetVersion: 1,
    unitStartTime: new Date(Date.now() - index * 7 * 60_000).toISOString(),
  })),
);

const facet: ComponentProps<typeof TopicTreemapView>["facet"] = {
  facetId: "intent",
  name: "Intent",
  facetVersion: 1,
  rows,
  topics,
  map: null,
  awaitingCount: 0,
  usableCount: rows.length,
};

const defaultArgs: ComponentProps<typeof TopicTreemapView> = {
  projectId: "storybook-topics",
  facet,
  onGenerateTopics: fn(),
  canGenerateTopics: true,
  peekView: {
    itemType: "TRACE",
    tableName: "topics-topic-traces",
    isV4: false,
    closePeek: fn(),
  },
};

const meta = preview.meta({
  component: TopicTreemapView,
  args: defaultArgs,
  render: (args) => (
    <div className="flex h-screen flex-col p-2">
      <TopicTreemapView {...args} />
    </div>
  ),
});

export const Default = meta.story({});

export const SelectTopic = meta.story({
  name: "(Test) Selecting a tile lists its traces",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = await canvas.findByRole("button", {
      name: "Trace cost analysis, 21 traces",
    });
    await userEvent.click(tile);
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    const list = canvas.getByRole("region", { name: "Topic traces" });
    await expect(
      within(list).getByRole("heading", { name: /Trace cost analysis/ }),
    ).toBeVisible();
  },
});
