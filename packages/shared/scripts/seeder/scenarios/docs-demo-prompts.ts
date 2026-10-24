import { Prisma, prisma } from "../../../src/db";
import { utcDayStartMs } from "./rng";
import { ScenarioDefinition, SeedError, SeedSummary } from "./types";

// ---------------------------------------------------------------------------
// Curated prompt catalogue for the docs-demo "customer-support" project:
// system prompts, a RAG answer prompt, shared guidelines, a movie-critic text
// prompt for playground demos, a support-reply chat prompt with a long label
// history, and a few prompts inside folders.
//
// Re-runs reset every catalogue prompt to exactly the versions below: versions
// added through the UI (e.g. while recording a video) are removed, labels are
// restored, the scratch prompts listed in SCRATCH_PROMPT_NAMES are deleted,
// and protected labels are cleared so the settings page starts empty.
// ---------------------------------------------------------------------------

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { type: "placeholder"; name: string };

type VersionDef = {
  prompt: string | ChatMessage[];
  config?: Record<string, unknown>;
  labels?: string[];
  commitMessage?: string;
};

type PromptDef = {
  name: string;
  type: "text" | "chat";
  tags: string[];
  versions: VersionDef[];
};

const DEMO_USER_EMAIL = "demo@langfuse.com";

/** Prompts that videos create through the UI and the seed removes again. */
const SCRATCH_PROMPT_NAMES = ["onboarding/welcome-email"];

const SUPPORT_SYSTEM =
  "You are Acme's customer support assistant. Be concise, friendly and accurate. Only answer questions about Acme products, orders and accounts.";

const QA_SYSTEM_BASE =
  "You answer customer questions using only the help-center context provided. If the context does not contain the answer, say so and offer to connect the customer with a human agent.";

const qaVersion = (
  system: string,
  user: string,
  extra: Partial<VersionDef> = {},
): VersionDef => ({
  prompt: [
    { role: "system", content: system },
    { role: "user", content: user },
  ],
  config: { model: "gpt-4.1-mini", temperature: 0.2 },
  ...extra,
});

const QA_USER_V1 = "Context:\n{{context}}\n\nQuestion: {{question}}";
const QA_USER =
  "Help-center context:\n{{context}}\n\nCustomer question: {{question}}\n\nAnswer in at most three sentences.";

const qaAnswerVersions: VersionDef[] = [
  qaVersion(QA_SYSTEM_BASE, QA_USER_V1, { commitMessage: "Initial version" }),
  qaVersion(QA_SYSTEM_BASE, QA_USER_V1, {
    commitMessage: "Lower temperature",
    config: { model: "gpt-4.1-mini", temperature: 0 },
  }),
  qaVersion(QA_SYSTEM_BASE, QA_USER, {
    commitMessage: "Limit answers to three sentences",
    labels: ["customer-1"],
  }),
  qaVersion(
    `${QA_SYSTEM_BASE} Never invent order numbers or prices.`,
    QA_USER,
    {
      commitMessage: "Guard against made-up order details",
      labels: ["template"],
    },
  ),
  qaVersion(
    `${QA_SYSTEM_BASE} Never invent order numbers or prices.`,
    QA_USER,
    {
      commitMessage: "Switch to gpt-4.1",
      config: { model: "gpt-4.1", temperature: 0.2 },
      labels: ["customer-2"],
    },
  ),
  qaVersion(
    `${QA_SYSTEM_BASE} Never invent order numbers or prices.`,
    QA_USER,
    {
      commitMessage: "Back to gpt-4.1-mini",
      labels: ["region-apac"],
    },
  ),
  qaVersion(
    `${QA_SYSTEM_BASE} Never invent order numbers or prices. Reply in the customer's language.`,
    QA_USER,
    { commitMessage: "Answer in the customer's language", labels: ["prod-a"] },
  ),
  qaVersion(
    `${QA_SYSTEM_BASE} Never invent order numbers or prices. Reply in the customer's language.`,
    QA_USER,
    { commitMessage: "Tune tone", labels: ["prod-b"] },
  ),
  qaVersion(
    `${QA_SYSTEM_BASE} Never invent order numbers or prices. Reply in the customer's language. Cite the help-center article title you used.`,
    QA_USER,
    {
      commitMessage: "Cite source article",
      labels: ["production", "approved"],
    },
  ),
  qaVersion(
    `${QA_SYSTEM_BASE} Never invent order numbers or prices. Reply in the customer's language. Cite the help-center article title you used.`,
    QA_USER,
    { commitMessage: "Try shorter answers", labels: ["experiment-1"] },
  ),
  qaVersion(
    `${QA_SYSTEM_BASE} Never invent order numbers or prices. Reply in the customer's language. Cite the help-center article title you used.`,
    QA_USER,
    { commitMessage: "Fix typo", labels: ["staging"] },
  ),
  qaVersion(
    `${QA_SYSTEM_BASE} Never invent order numbers or prices. Reply in the customer's language. Cite the help-center article title you used and link to it.`,
    QA_USER,
    { commitMessage: "Link cited article" },
  ),
];

const REPLY_SYSTEM_V1 =
  "You draft replies to customer support tickets for Acme. Keep a warm, professional tone.";
const REPLY_SYSTEM =
  "You draft replies to customer support tickets for Acme. Keep a warm, professional tone. Address the customer by first name and end with a clear next step.";

const supportReplyVersions: VersionDef[] = [
  {
    prompt: [
      { role: "system", content: REPLY_SYSTEM_V1 },
      { role: "user", content: "{{ticket}}" },
    ],
    config: { model: "gpt-4.1-mini", temperature: 0.7 },
    commitMessage: "Initial version",
  },
  {
    prompt: [
      { role: "system", content: `${REPLY_SYSTEM_V1}\n\nBe nice!` },
      { role: "user", content: "{{ticket}}" },
    ],
    config: { model: "gpt-4.1-mini", temperature: 0.7 },
    commitMessage: "Make replies friendlier",
    labels: ["customer-acme"],
  },
  {
    prompt: [
      { role: "system", content: REPLY_SYSTEM },
      { role: "user", content: "{{ticket}}" },
    ],
    config: { model: "gpt-4.1-mini", temperature: 0.7 },
    commitMessage: "Add next-step closing",
    labels: ["experiment-tone"],
  },
  {
    prompt: [
      { role: "system", content: REPLY_SYSTEM },
      { type: "placeholder", name: "history" },
      { role: "user", content: "{{ticket}}" },
    ],
    config: { model: "gpt-4.1-mini", temperature: 0.5 },
    commitMessage: "Include conversation history",
    labels: ["production"],
  },
  {
    prompt: [
      { role: "system", content: REPLY_SYSTEM },
      { type: "placeholder", name: "history" },
      {
        role: "user",
        content: "Customer: {{customer_name}}\nTicket:\n{{ticket}}",
      },
    ],
    config: { model: "gpt-4.1-mini", temperature: 0.5 },
    commitMessage: "Pass customer name",
    labels: ["staging"],
  },
];

const PROMPTS: PromptDef[] = [
  {
    name: "support-agent-system",
    type: "text",
    tags: ["support", "system"],
    versions: [
      { prompt: SUPPORT_SYSTEM, commitMessage: "Initial version" },
      {
        prompt: `${SUPPORT_SYSTEM} When you are unsure, ask a clarifying question instead of guessing.`,
        commitMessage: "Ask before guessing",
        labels: ["production"],
      },
    ],
  },
  {
    name: "qa-answer-with-context-chat",
    type: "chat",
    tags: ["support", "rag"],
    versions: qaAnswerVersions,
  },
  {
    name: "guidelines",
    type: "text",
    tags: ["support", "policy"],
    versions: [
      {
        prompt:
          "- Be polite and use the customer's name.\n- Never share internal ticket ids.",
        commitMessage: "Initial guidelines",
      },
      {
        prompt:
          "- Be polite and use the customer's name.\n- Never share internal ticket ids.\n- Offer a human handoff for billing disputes.",
        commitMessage: "Add billing handoff rule",
      },
      {
        prompt:
          "- Be polite and use the customer's name.\n- Never share internal ticket ids or other customers' data.\n- Offer a human handoff for billing disputes.\n- Keep answers under 120 words.",
        commitMessage: "Add length limit",
        labels: ["production"],
      },
    ],
  },
  {
    name: "support-reply",
    type: "chat",
    tags: ["support"],
    versions: supportReplyVersions,
  },
  {
    name: "movie-critic",
    type: "text",
    tags: ["demo"],
    versions: [
      {
        prompt: "As a {{criticlevel}} movie critic, do you like {{movie}}?",
        config: { model: "gpt-4.1-mini", temperature: 0.7 },
        commitMessage: "Initial version",
      },
      {
        prompt:
          "As a {{criticlevel}} movie critic, do you like {{movie}}? Answer in one short paragraph.",
        config: { model: "gpt-4.1-mini", temperature: 0.7 },
        commitMessage: "Keep reviews short",
        labels: ["staging"],
      },
      {
        prompt:
          "As a {{criticlevel}} movie critic, do you like {{movie}}? Answer in one short paragraph and end with a rating out of 10.",
        config: { model: "gpt-4.1-mini", temperature: 0.7 },
        commitMessage: "Add rating",
        labels: ["production"],
      },
    ],
  },
  {
    name: "ticket-summary",
    type: "text",
    tags: ["support"],
    versions: [
      {
        prompt:
          "Summarize this support ticket in two sentences for the agent taking over:\n\n{{ticket}}",
        config: { model: "gpt-4.1-mini", temperature: 0 },
        commitMessage: "Initial version",
        labels: ["production"],
      },
    ],
  },
  {
    name: "billing/refund-reply",
    type: "chat",
    tags: ["support", "billing"],
    versions: [
      {
        prompt: [
          {
            role: "system",
            content:
              "You handle refund requests for Acme. Refunds are possible within 30 days of delivery. Explain the next steps clearly.",
          },
          { role: "user", content: "Order {{order_id}}: {{message}}" },
        ],
        config: { model: "gpt-4.1-mini", temperature: 0.3 },
        commitMessage: "Initial version",
        labels: ["production"],
      },
    ],
  },
  {
    name: "billing/invoice-question",
    type: "text",
    tags: ["support", "billing"],
    versions: [
      {
        prompt:
          "Answer the customer's invoice question using the invoice data below.\n\nInvoice:\n{{invoice}}\n\nQuestion: {{question}}",
        commitMessage: "Initial version",
        labels: ["production"],
      },
    ],
  },
  {
    name: "escalation/triage-classifier",
    type: "text",
    tags: ["support", "routing"],
    versions: [
      {
        prompt:
          "Classify the ticket into one of: billing, shipping, account, technical, other. Return only the label.\n\n{{ticket}}",
        config: { model: "gpt-4.1-mini", temperature: 0 },
        commitMessage: "Initial version",
        labels: ["production"],
      },
    ],
  },
  {
    name: "escalation/handoff-note",
    type: "text",
    tags: ["support", "routing"],
    versions: [
      {
        prompt:
          "Write a short handoff note for a human agent. Include the customer's goal, what was tried, and the open question.\n\n{{conversation}}",
        commitMessage: "Initial version",
        labels: ["production"],
      },
    ],
  },
];

function summary(
  ctx: Parameters<ScenarioDefinition["run"]>[0],
  startedAt: number,
  versions: number,
  verified: Record<string, number>,
  dryRun: boolean,
): SeedSummary {
  const base = `${ctx.baseUrl}/project/${ctx.projectId}/prompts`;
  return {
    scenario: "docs-demo-prompts",
    target: "clickhouse",
    params: {},
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    counts: { prompts: PROMPTS.length, promptVersions: versions },
    verified,
    links: [
      base,
      `${base}/${encodeURIComponent("qa-answer-with-context-chat")}`,
      `${base}/${encodeURIComponent("movie-critic")}`,
    ],
    dryRun,
    durationMs: Date.now() - startedAt,
  };
}

export const docsDemoPromptsScenario: ScenarioDefinition = {
  name: "docs-demo-prompts",
  description:
    "Curated prompt catalogue for the docs-demo project (support-agent-system, qa-answer-with-context-chat with 12 versions and many labels, guidelines, support-reply, movie-critic, ticket-summary, prompts in billing/ and escalation/ folders). Re-runs reset versions and labels, delete scratch prompts created by videos, and clear protected labels.",
  supportsV4: false,
  flags: [],
  run: async (ctx) => {
    const startedAt = Date.now();
    const project = await prisma.project.findUnique({
      where: { id: ctx.projectId },
    });
    if (!project) {
      throw new SeedError(
        `project ${ctx.projectId} not found`,
        "pnpm run seed -- docs-demo-project",
      );
    }
    const user = await prisma.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
    });
    const createdBy = user?.id ?? "API";
    const versionCount = PROMPTS.reduce((n, p) => n + p.versions.length, 0);
    if (ctx.dryRun) {
      return summary(ctx, startedAt, versionCount, {}, true);
    }

    const anchor = utcDayStartMs() - 30 * 24 * 3600 * 1000;
    let step = 0;

    await prisma.promptProtectedLabels.deleteMany({
      where: { projectId: ctx.projectId },
    });
    await prisma.prompt.deleteMany({
      where: {
        projectId: ctx.projectId,
        name: {
          in: [...SCRATCH_PROMPT_NAMES, ...PROMPTS.map((p) => p.name)],
        },
        // Seeded versions are upserted below; delete only extras.
        NOT: {
          OR: PROMPTS.map((p) => ({
            name: p.name,
            version: { lte: p.versions.length },
          })),
        },
      },
    });

    for (const def of PROMPTS) {
      for (const [index, version] of def.versions.entries()) {
        const versionNumber = index + 1;
        const isLatest = versionNumber === def.versions.length;
        const labels = [
          ...(version.labels ?? []),
          ...(isLatest ? ["latest"] : []),
        ];
        const createdAt = new Date(anchor + step * 5 * 3600 * 1000);
        step += 1;
        const data = {
          prompt: version.prompt as Prisma.InputJsonValue,
          type: def.type,
          config: (version.config ?? {}) as Prisma.InputJsonValue,
          tags: def.tags,
          labels,
          commitMessage: version.commitMessage ?? null,
          createdBy,
          createdAt,
          updatedAt: createdAt,
        };
        await prisma.prompt.upsert({
          where: {
            projectId_name_version: {
              projectId: ctx.projectId,
              name: def.name,
              version: versionNumber,
            },
          },
          create: {
            id: `docs-demo-prompt-${ctx.projectId}-${def.name.replace(/\//g, "-")}-v${versionNumber}`,
            projectId: ctx.projectId,
            name: def.name,
            version: versionNumber,
            ...data,
          },
          update: data,
        });
      }
    }

    const verified: Record<string, number> = {
      promptVersions: await prisma.prompt.count({
        where: {
          projectId: ctx.projectId,
          name: { in: PROMPTS.map((p) => p.name) },
        },
      }),
    };
    if (verified.promptVersions !== versionCount) {
      throw new SeedError(
        `expected ${versionCount} prompt versions, found ${verified.promptVersions}`,
      );
    }
    return summary(ctx, startedAt, versionCount, verified, false);
  },
};
