import { expect, userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { ObservabilityEntityDetailHeader } from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { traceTopicRows } from "./trace-topic-rows";

type Result = Parameters<typeof traceTopicRows>[0][number];

const intent = "Investigate webhook delivery failures caused by a TLS error.";
const sentiment =
  "Neutral: user reported a webhook delivery failure without emotional cues.";
const result = (
  facet: "intent" | "sentiment",
  ruleName: string,
  topic: { name: string; index: number } | { outcome: string },
): Result => ({
  facetId: facet,
  name: facet === "intent" ? "Intent" : "Sentiment",
  runId: `${facet}-${ruleName}`,
  ruleName,
  summary: facet === "intent" ? intent : sentiment,
  outcome: "name" in topic ? "assigned" : topic.outcome,
  topicId: "name" in topic ? topic.name : null,
  topicName: "name" in topic ? topic.name : null,
  topicIndex: "name" in topic ? topic.index : -1,
});

function header(results: Result[]) {
  const assigned = results.filter((item) => item.topicName);
  return {
    variant: "page" as const,
    headerProps: { title: "trace-7f3a", itemType: "TRACE" as const },
    metrics: [
      {
        id: "topics",
        type: "details" as const,
        text: assigned[0]?.topicName
          ? `${assigned[0].topicName}${assigned.length > 1 ? ` +${assigned.length - 1}` : ""}`
          : "Topics",
        title: "Topics",
        href: "#",
        linkText: "Open in Topics →",
        searchText: "topics",
        rows: traceTopicRows(results),
      },
    ],
  };
}

const meta = preview.meta({
  component: ObservabilityEntityDetailHeader,
});

/** One rule map per question: one topic or status per row, as before. */
export const OneTopicPerQuestion = meta.story({
  name: "(Test) A single topic per question shows no rule caption",
  args: header([
    result("intent", "All traces", {
      name: "Troubleshoot Webhook Failures",
      index: 0,
    }),
    result("sentiment", "All traces", { outcome: "outlier" }),
  ]),
  play: async ({ canvas }) => {
    await userEvent.hover(
      canvas.getAllByText("Troubleshoot Webhook Failures")[0],
    );
    const card = within(document.body);
    await expect(await card.findByText(intent)).toBeInTheDocument();
    await expect(card.getByText("outlier")).toBeInTheDocument();
    await expect(card.queryByText("All traces")).toBeNull();
  },
});

const overlaps = (a: Element, b: Element) => {
  const first = a.getBoundingClientRect();
  const second = b.getBoundingClientRect();
  return (
    first.left < second.right &&
    second.left < first.right &&
    first.top < second.bottom &&
    second.top < first.bottom
  );
};

/** Long rule and topic names wrap inside the card instead of covering the question. */
export const LongTopicNames = meta.story({
  name: "(Test) Long rule and topic names keep the question label readable",
  args: header([
    result("intent", "Product questions", {
      name: "Langfuse product overview and onboarding questions",
      index: 0,
    }),
    result("intent", "QA-Chatbot Topics", {
      name: "Explain Langfuse uses with doc links and a follow-up quickstart offer",
      index: 2,
    }),
    result("sentiment", "Tone", {
      name: "Neutral, information-seeking tone without frustration or urgency",
      index: 1,
    }),
  ]),
  play: async ({ canvas }) => {
    await userEvent.hover(
      canvas.getAllByText(
        "Langfuse product overview and onboarding questions +2",
      )[0],
    );
    const card = within(document.body);
    const label = await card.findByText("Intent");
    const grid = label.parentElement!;
    const others = [
      card.getByText("Product questions"),
      card.getByText("QA-Chatbot Topics"),
      card.getByText("Langfuse product overview and onboarding questions"),
      card.getByText(
        "Explain Langfuse uses with doc links and a follow-up quickstart offer",
      ),
    ];
    for (const other of others) {
      await expect(overlaps(label, other)).toBe(false);
      const { left, right } = other.getBoundingClientRect();
      await expect(left).toBeGreaterThanOrEqual(
        grid.getBoundingClientRect().left,
      );
      await expect(right).toBeLessThanOrEqual(
        grid.getBoundingClientRect().right,
      );
    }
  },
});

/** Two rules assigned the trace on Intent; rules that didn't stay out of the row. */
export const TwoTopicsInOneQuestion = meta.story({
  name: "(Test) Two rules' topics share one question row",
  args: header([
    result("intent", "All traces", {
      name: "Troubleshoot Webhook Failures",
      index: 0,
    }),
    result("intent", "Billing agent", { name: "Retry Exhaustion", index: 3 }),
    result("intent", "2nd Run", { outcome: "awaiting_map" }),
    result("sentiment", "All traces", { outcome: "outlier" }),
    result("sentiment", "2nd Run", { outcome: "awaiting_map" }),
  ]),
  play: async ({ canvas }) => {
    await userEvent.hover(
      canvas.getAllByText("Troubleshoot Webhook Failures +1")[0],
    );
    const card = within(document.body);
    // The card fades in, so check content rather than visibility.
    await expect(await card.findByText("Retry Exhaustion")).toBeInTheDocument();
    await expect(card.getByText("Billing agent")).toBeInTheDocument();
    await expect(card.queryByText("awaiting map")).toBeNull();
    await expect(card.getAllByText(intent)).toHaveLength(1);
    await expect(card.getByText("outlier")).toBeInTheDocument();
  },
});
