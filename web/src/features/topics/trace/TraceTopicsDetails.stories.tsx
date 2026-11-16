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

const unbrokenRule =
  "qa_chatbot_topics_for_onboarding_and_product_questions_production_v2";

/** Long rule and topic names wrap inside the card instead of covering the question. */
export const LongTopicNames = meta.story({
  name: "(Test) Long rule and topic names keep the question label readable",
  args: header([
    result("intent", "Product questions", {
      name: "Langfuse product overview and onboarding questions",
      index: 0,
    }),
    result("intent", unbrokenRule, {
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
    await card.findByText("Intent");
    // Each question label with its rule captions and topic badges.
    const rows = [
      {
        label: "Intent",
        lines: [
          [
            "Product questions",
            "Langfuse product overview and onboarding questions",
          ],
          [
            unbrokenRule,
            "Explain Langfuse uses with doc links and a follow-up quickstart offer",
          ],
        ],
      },
      {
        label: "Sentiment",
        lines: [
          [
            undefined,
            "Neutral, information-seeking tone without frustration or urgency",
          ],
        ],
      },
    ];
    for (const row of rows) {
      const label = card.getByText(row.label);
      const grid = label.parentElement!.getBoundingClientRect();
      for (const [caption, topic] of row.lines) {
        const badge = card.getByText(topic!);
        const cells = caption ? [card.getByText(caption), badge] : [badge];
        for (const cell of cells) {
          await expect(overlaps(label, cell)).toBe(false);
          const { left, right } = cell.getBoundingClientRect();
          await expect(left).toBeGreaterThanOrEqual(grid.left);
          await expect(right).toBeLessThanOrEqual(grid.right);
        }
        // A squeezed badge clips its own text.
        await expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth);
        if (caption)
          await expect(badge.getBoundingClientRect().left).toBeGreaterThan(
            card.getByText(caption).getBoundingClientRect().right,
          );
      }
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
