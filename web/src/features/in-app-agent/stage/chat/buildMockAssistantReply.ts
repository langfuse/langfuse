import type {
  CapturedPageContext,
  PageContextFact,
} from "@/src/features/page-context";

type Topic = "latency" | "cost" | "errors" | "summary";

const TOPIC_PATTERNS: Array<[Topic, RegExp]> = [
  ["errors", /\b(error|errors|fail|failed|failing|broke|exception|wrong)\b/i],
  ["cost", /\b(cost|costs|expensive|price|spend|\$|tokens?)\b/i],
  ["latency", /\b(slow|slowest|latency|long|took|time|fast|speed|duration)\b/i],
];

function detectTopic(question: string): Topic {
  return (
    TOPIC_PATTERNS.find(([, pattern]) => pattern.test(question))?.[0] ??
    "summary"
  );
}

function factDisplay(facts: PageContextFact[], key: string) {
  return facts.find((item) => item.key === key)?.display;
}

function describeStep(step: {
  title: string;
  label: string;
  facts: PageContextFact[];
}) {
  const details = [
    factDisplay(step.facts, "latency_ms"),
    factDisplay(step.facts, "cost_usd"),
    factDisplay(step.facts, "model"),
  ].filter(Boolean);
  return `\`${step.title}\` (${step.label.toLowerCase()}${details.length > 0 ? `, ${details.join(", ")}` : ""})`;
}

function traceReply(question: string, context: CapturedPageContext) {
  const latency = factDisplay(context.facts, "latency_ms");
  const cost = factDisplay(context.facts, "cost_usd");
  const observations = factDisplay(context.facts, "observations");
  const tokens = factDisplay(context.facts, "tokens");
  const related = context.related ?? [];
  const errors = related.filter((step) => step.reason === "error");
  const slowest = related.filter((step) => step.reason === "slowest step");
  const costliest = related.find(
    (step) => step.reason === "most expensive step",
  );
  const topic = detectTopic(question);
  const [firstError] = errors;

  const headline = [
    latency ? `ran for **${latency}**` : null,
    observations ? `across **${observations} observations**` : null,
    cost ? `and cost **${cost}**` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const lines = [
    `**\`${context.title}\`** ${headline || "is the trace you had open"}${tokens ? ` (${tokens} tokens)` : ""}.`,
    "",
  ];

  const bullets: Record<Topic, string[]> = {
    latency: slowest.map(
      (step, index) =>
        `${index === 0 ? "The slowest step is" : "Next is"} ${describeStep(step)}.`,
    ),
    cost: costliest
      ? [`Most of the spend is in ${describeStep(costliest)}.`]
      : ["No observation reports a cost, so spend is not tracked here."],
    errors:
      errors.length > 0
        ? errors.map((step) => {
            const status = factDisplay(step.facts, "status_message");
            return `${describeStep(step)} failed${status ? `: "${status}"` : ""}.`;
          })
        : ["No observation in this trace reports an error."],
    summary: [
      ...slowest
        .slice(0, 1)
        .map((step) => `Slowest step: ${describeStep(step)}.`),
      ...(costliest ? [`Most expensive: ${describeStep(costliest)}.`] : []),
      firstError
        ? `${errors.length} step${errors.length === 1 ? "" : "s"} reported an error, starting with ${describeStep(firstError)}.`
        : "No step reported an error.",
    ],
  };
  for (const bullet of bullets[topic]) {
    lines.push(`- ${bullet}`);
  }

  if (context.focus) {
    lines.push(
      "",
      `You had ${describeStep(context.focus)} selected, so that is where I would look first.`,
    );
  }
  return lines;
}

function genericReply(context: CapturedPageContext) {
  const facts = context.facts
    .slice(0, 4)
    .map((item) => `- **${item.label}:** ${item.display}`);
  return [
    `You were looking at the ${context.label.toLowerCase()} **${context.title}**.`,
    ...(facts.length > 0 ? ["", ...facts] : []),
  ];
}

/**
 * A plausible answer computed only from the structured context, for previews
 * without an assistant backend. Showing real numbers makes it visible that the
 * context is data, not a picture.
 */
export function buildMockAssistantReply(
  question: string,
  context: CapturedPageContext,
): string {
  const lines =
    context.kind === "trace"
      ? traceReply(question, context)
      : genericReply(context);
  lines.push(
    "",
    "_Mocked response: this preview has no assistant backend. With one enabled, your question is sent together with this structured context._",
  );
  return lines.join("\n");
}
