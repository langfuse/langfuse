import {
  bullets,
  heading,
  type NotebookFixture,
  paragraph,
  text,
} from "./supportAssistantFixtures";

export const promptExperiments = {
  id: "prompt-experiments",
  title: "Prompt experiment results",
  layout: "table",
  propertySchema: {
    version: 1,
    fields: [
      { id: "passRate", label: "Pass rate (%)", type: "number" },
      { id: "latency", label: "p95 latency (s)", type: "number" },
      { id: "cost", label: "Cost / 1K (USD)", type: "number" },
      { id: "evaluated", label: "Evaluated", type: "number" },
    ],
  },
  publications: [
    {
      number: 1,
      publishedAt: new Date("2026-11-23T15:00:00Z"),
      documents: [
        {
          id: "main",
          title: "Shorter instructions",
          properties: {
            passRate: 94.1,
            latency: 1.2,
            cost: 8.2,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Removed repeated policy reminders and kept the refund eligibility decision tree.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Some replies omit the return window for orders with mixed eligibility.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Canary this variant: it improves pass rate while reducing latency and cost.",
              ),
            ),
          ],
        },
        {
          id: "few-shot-examples",
          title: "Few-shot examples",
          properties: {
            passRate: 93.8,
            latency: 1.6,
            cost: 10.9,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Added three examples covering refunds, exchanges, and missing orders.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Some replies copied phrasing from an example that did not fit the customer's situation.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Replace the examples with more varied cases before retesting.",
              ),
            ),
          ],
        },
        {
          id: "policy-first",
          title: "Policy-first answers",
          properties: {
            passRate: 94.7,
            latency: 1.5,
            cost: 9.4,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Asked the assistant to identify the applicable policy before drafting a reply.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Replies sometimes quoted policy before answering a simple question.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Keep the policy check but lead the reply with the answer.",
              ),
            ),
          ],
        },
        {
          id: "compact-retrieval",
          title: "Compact retrieval",
          properties: {
            passRate: 91.6,
            latency: 1.0,
            cost: 7.1,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Limited retrieval to the two highest-ranked policy snippets.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Regional exceptions were often missing from the retrieved context.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Avoid using this variant for requests that depend on regional policy.",
              ),
            ),
          ],
        },
        {
          id: "clarify-first",
          title: "Clarify missing details",
          properties: {
            passRate: 93.2,
            latency: 1.3,
            cost: 8.8,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Asked one clarifying question when a missing detail could change eligibility.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "The assistant sometimes asked for details already available in the order record.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Check the order record before asking the customer for more information.",
              ),
            ),
          ],
        },
        {
          id: "baseline",
          title: "Baseline",
          properties: {
            passRate: 92.3,
            latency: 1.4,
            cost: 9.8,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Used the current production prompt and retrieval settings unchanged.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "The assistant sometimes asks for an order ID already present in the conversation.",
              ),
              heading(3, "Recommendation"),
              paragraph("Keep this variant as the canary control."),
            ),
          ],
        },
        {
          id: "extra-context",
          title: "Extra retrieval context",
          properties: {
            passRate: 95.2,
            latency: 2.1,
            cost: 13.4,
            evaluated: 600,
          },
          blocks: [
            text(
              "report",
              heading(3, "What changed"),
              paragraph(
                "Increased the retrieved policy snippets from three to six.",
              ),
              heading(3, "Where it failed"),
              bullets(
                "Some replies cite an older policy when retrieval surfaces multiple revisions.",
              ),
              heading(3, "Recommendation"),
              paragraph(
                "Consider this variant for complex cases where the quality gain justifies the added latency.",
              ),
            ),
          ],
        },
      ],
    },
  ],
  chartRows: {},
} satisfies NotebookFixture;
