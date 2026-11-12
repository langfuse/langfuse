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

/** One rule map per question: one topic or status per row. */
export const OneTopicPerQuestion = meta.story({
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
