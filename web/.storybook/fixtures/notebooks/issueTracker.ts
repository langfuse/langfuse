import {
  bullets,
  heading,
  incidentLatency,
  incidentLatencyRows,
  type NotebookFixture,
  paragraph,
  row,
  strong,
  text,
} from "./supportAssistantFixtures";

const triagedIssues = [
  {
    id: "main",
    title: "SUP-184 · Slow answers after policy lookup rollout",
    properties: {
      status: "Mitigated",
      priority: "P1",
    },
    blocks: [
      text(
        "slow-answer-report",
        paragraph(
          "Customers waited several seconds for their first answer or saw the chat time out. During the 18 Nov rollout, 118 of 326 production requests exceeded 2.5 s, including 19 timeouts. The impact was concentrated in refund and returns questions that call the policy service.",
        ),
      ),
      incidentLatency,
      row(
        "slow-answer-findings",
        text(
          "slow-answer-evidence",
          heading(3, "Evidence"),
          bullets(
            "The 09:00 UTC bucket reached 4.8 s p95; the preceding hour was 1.22 s.",
            "Retries spiked on policy lookups after release 2.17.3. Model response time stayed flat.",
            "Rolling back the lookup client restored latency without changing the model or prompt.",
          ),
        ),
        text(
          "slow-answer-acceptance",
          heading(3, "Before we close"),
          bullets(
            "Cap the combined policy lookup and retry budget at 850 ms.",
            "Exercise a deliberately slow policy backend in the canary.",
            "Hold p95 below 2.5 s and see no retry burst during a 30-minute production canary.",
          ),
        ),
      ),
    ],
  },
  {
    id: "refund-confirmations",
    title: "SUP-191 · Duplicate refund confirmations",
    properties: {
      status: "In progress",
      priority: "P2",
    },
    blocks: [
      text(
        "refund-report",
        paragraph(
          "An agent can send two confirmation emails for a single refund if the refund succeeds but the tool times out before returning its receipt. Finance verified that the payment processor posted only one refund in each reviewed case.",
        ),
        {
          type: "blockquote",
          content: [
            paragraph(
              "“I received two refund emails. Can you confirm you haven't charged or refunded me twice?” — Redacted support ticket",
            ),
          ],
        },
      ),
      row(
        "refund-details",
        text(
          "refund-repro",
          heading(3, "Reproduction"),
          bullets(
            "Start a refund in staging and delay the receipt response past the caller’s timeout.",
            "Let the agent retry the tool call under the same conversation.",
            "Observe one refund receipt but two confirmation events.",
          ),
        ),
        text(
          "refund-resolution",
          heading(3, "Expected behavior"),
          paragraph(
            "Look up the existing receipt before retrying the notification. Key the notification on the refund ID, not on the individual tool attempt.",
          ),
          paragraph(
            strong("Acceptance"),
            " · One receipt and one customer notification across timeout, retry, and replay tests.",
          ),
        ),
      ),
    ],
  },
  {
    id: "eea-returns-policy",
    title: "SUP-197 · Outdated EEA returns window",
    properties: {
      status: "In review",
      priority: "P2",
    },
    blocks: [
      text(
        "returns-report",
        paragraph(
          "The assistant sometimes cites an archived 14-day returns policy for eligible EEA orders. The current policy in the help center is 30 days. Customers who already closed the chat may believe their window expired.",
        ),
      ),
      text(
        "returns-evidence",
        heading(3, "Evidence and scope"),
        paragraph(
          "Stale policy citations were the largest failure category in this week’s review: 26 of 65 failed audits. Manual review linked 11 of those 26 to the EEA returns article. The remaining 15 are tracked by article rather than assumed to share this cause.",
        ),
        heading(3, "Proposed fix"),
        bullets(
          "Filter archived policy revisions out at retrieval time and reindex the current localized articles.",
          "Add test conversations for EEA, UK, and US returns, each with their own policy expectations.",
          "Confirm replayed answers cite the current article and do not generalize the EEA window to other regions.",
        ),
      ),
    ],
  },
] satisfies NotebookFixture["publications"][number]["documents"];

export const issueTracker = {
  id: "northstar-support-issues",
  title: "Support issue tracker",
  layout: "inbox",
  propertySchema: {
    version: 1,
    fields: [
      {
        id: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "Open", color: "neutral" },
          { value: "In progress", color: "info" },
          { value: "In review", color: "warning" },
          { value: "Mitigated", color: "success" },
        ],
      },
      {
        id: "priority",
        label: "Priority",
        type: "select",
        options: [
          { value: "P1", color: "danger" },
          { value: "P2", color: "warning" },
          { value: "P3", color: "neutral" },
        ],
      },
    ],
    visibleByDefault: ["status", "priority"],
  },
  publications: [
    {
      number: 1,
      publishedAt: new Date("2026-11-22T17:00:00Z"),
      documents: triagedIssues,
    },
  ],
  draft: [
    ...triagedIssues,
    {
      id: "handoff-context",
      title: "SUP-203 · Escalation loses the previous order",
      properties: { status: "Open", priority: "P3" },
      blocks: [
        text(
          "handoff-report",
          paragraph(
            "When a customer returns to an existing conversation and requests a human, the escalation summary can omit the order ID supplied earlier. Agents then ask for the same details again.",
          ),
          heading(3, "What we know"),
          bullets(
            "Nine audited answers had a missing handoff as their primary failure. This issue covers the subset where an order ID was already captured.",
            "The raw conversation still includes the ID. It is lost when the summary is reconstructed from only the latest chat turn.",
          ),
          heading(3, "Next step"),
          paragraph(
            "Reproduce with a resumed session and verify the escalation payload contains the original order reference. Do not include payment details in the summary.",
          ),
        ),
      ],
    },
  ],
  chartRows: { [incidentLatency.id]: incidentLatencyRows },
} satisfies NotebookFixture;
