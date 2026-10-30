import { createHash } from "node:crypto";
import { prisma } from "../../../src/db";
import {
  createEventsCh,
  createObservation,
  createObservationsCh,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
} from "../../../src/server";
import {
  createTopicExecution,
  ensureDefaultTopicFacets,
  getTopicRun,
  listTopicRules,
  saveTopicRule,
  saveTopicRun,
  TOPICS_CLUSTER_ACTION,
  TOPICS_SYSTEM_USER_ID,
  writeTopicAssignments,
  writeTopicExecution,
  writeTopicSummaries,
} from "../../../src/server/topics";
import {
  TOPICS_MAX_RULES,
  type TopicAssignment,
  type TopicDefinition,
  type TopicFacet,
  type TopicRule,
  type TopicSummary,
  type TopicTimeRange,
} from "../../../src/topics";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, Rng, utcDayStartMs } from "./rng";
import { ScenarioContext, SeedError, SeedSummary } from "./types";
import { countRows, tracesListLink } from "./verify";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DAYS = 10;
const ENVIRONMENT = "production";
const EMBEDDING_MODEL = "text-embedding-3-small";
const DIMENSIONS = 1024;
const SUMMARY_MODEL = "gpt-4.1-mini";

type Agent = "support-agent" | "checkout-agent";
type FacetName = "Intent" | "Outcome" | "Issues";

// Weights change with the trace's age so the second run of each analysis has
// new, grown, shrunk and gone topics compared with the first.
type Theme = {
  key: string;
  agent: Agent;
  group: string;
  weight: (daysAgo: number) => number;
  /** Topic in the rule's Intent map, coarser than the analysis breakdown. */
  ruleIntent: string;
  intent: string;
  exchanges: ReadonlyArray<readonly [string, string]>;
};

const recent = (daysAgo: number) => daysAgo < 3;

const THEMES: readonly Theme[] = [
  {
    key: "refund_duplicate",
    agent: "support-agent",
    group: "refund",
    weight: (d) => (recent(d) ? 16 : 10),
    ruleIntent: "refund_duplicate",
    intent: "Asks for a refund of a duplicate card charge on one order.",
    exchanges: [
      [
        "I was charged twice for order 4821. Can you refund the duplicate payment?",
        "I can see two captures for that order. I've asked billing to reverse the second one; it usually takes 5–7 business days to show on your statement.",
      ],
      [
        "My card shows the same amount twice after I placed one order. Please refund one.",
        "Thanks for flagging this. The second charge is a duplicate authorization; I've opened a refund request with the order reference.",
      ],
    ],
  },
  {
    key: "refund_missing",
    agent: "support-agent",
    group: "refund",
    weight: () => 12,
    ruleIntent: "refund_missing",
    intent:
      "Asks where an approved refund is because it has not arrived on the card yet.",
    exchanges: [
      [
        "You approved my refund two weeks ago but nothing has arrived. Where is it?",
        "The refund was issued on our side. Banks can take up to 10 business days; if it hasn't arrived by Friday I'll escalate with the payment reference.",
      ],
      [
        "Still no refund for my returned headphones. What's going on?",
        "Your return was received and the refund is pending finance approval. I can't speed it up from here, but I've added a note to the case.",
      ],
    ],
  },
  {
    key: "refund_partial",
    agent: "support-agent",
    group: "refund",
    weight: (d) => (recent(d) ? 10 : 0),
    ruleIntent: "refund_missing",
    intent:
      "Disputes a partial refund that left out shipping or one returned item.",
    exchanges: [
      [
        "I returned the whole order but only got part of the money back. Why?",
        "Shipping fees are non-refundable under the current policy, which explains the difference. I can't override that.",
      ],
      [
        "My refund is missing one of the two items I sent back.",
        "Only one item is marked as received at the warehouse. I'll ask them to check the second parcel.",
      ],
    ],
  },
  {
    key: "refund_canceled",
    agent: "support-agent",
    group: "refund",
    weight: (d) => (d >= 7 ? 14 : 0),
    ruleIntent: "refund_missing",
    intent: "Asks for a refund after canceling an order before it shipped.",
    exchanges: [
      [
        "I canceled my order an hour after placing it. When do I get my money back?",
        "The cancellation went through before shipping, so a full refund is on its way to your original payment method.",
      ],
    ],
  },
  {
    key: "login_password",
    agent: "support-agent",
    group: "login",
    weight: () => 12,
    ruleIntent: "login_password",
    intent: "Cannot reset the account password because the reset email fails.",
    exchanges: [
      [
        "The password reset email never arrives. I've checked spam.",
        "I've re-sent the reset link from our side and confirmed your address. It should arrive within a few minutes.",
      ],
      [
        "Reset link says it's invalid every time I click it.",
        "Links expire after 30 minutes and only the newest one works. Please request a new one and open it right away.",
      ],
    ],
  },
  {
    key: "login_magic",
    agent: "support-agent",
    group: "login",
    weight: (d) => (recent(d) ? 7 : 0),
    ruleIntent: "login_password",
    intent: "Magic sign-in link expired or opened on a different device.",
    exchanges: [
      [
        "The sign-in link from your email says it has expired.",
        "Magic links must be opened on the same device and browser that requested them. Request a new link from this device.",
      ],
    ],
  },
  {
    key: "login_2fa",
    agent: "support-agent",
    group: "login",
    weight: (d) => (recent(d) ? 4 : 10),
    ruleIntent: "login_2fa",
    intent:
      "Two-factor codes are rejected or the authenticator device is lost.",
    exchanges: [
      [
        "My authenticator codes keep getting rejected.",
        "Codes are time-based; please check that your phone's clock is set automatically, then try again.",
      ],
      [
        "I lost my phone and can't get past two-factor.",
        "Use one of your backup codes. If you don't have them, I can start an identity check to reset two-factor.",
      ],
    ],
  },
  {
    key: "login_sso",
    agent: "support-agent",
    group: "login",
    weight: (d) => (recent(d) ? 13 : 5),
    ruleIntent: "login_sso",
    intent:
      "Company SSO sign-in fails with an error from the identity provider.",
    exchanges: [
      [
        "Our team gets 'SAML response invalid' when signing in with Okta.",
        "That usually means the certificate on your SSO connection rotated. Your admin needs to upload the new certificate in the SSO settings.",
      ],
      [
        "SSO login loops back to the login page for everyone in our org.",
        "I see your domain's SSO connection is misconfigured. I've escalated to our identity team and will follow up.",
      ],
    ],
  },
  {
    key: "shipping",
    agent: "support-agent",
    group: "shipping",
    weight: () => 12,
    ruleIntent: "shipping",
    intent: "Asks why a shipped order is late and when it will arrive.",
    exchanges: [
      [
        "My order was supposed to arrive Monday. Tracking hasn't moved in four days.",
        "The carrier reports a delay at the regional hub. The new estimate is Thursday; I'll refund shipping if it misses that.",
      ],
    ],
  },
  {
    key: "account",
    agent: "support-agent",
    group: "account",
    weight: () => 10,
    ruleIntent: "account",
    intent: "Wants to change the account email address or company details.",
    exchanges: [
      [
        "How do I change the email address on my account?",
        "Go to Settings, then Profile, and update the email. We'll send a confirmation to both addresses.",
      ],
    ],
  },
  {
    key: "payment_declined",
    agent: "checkout-agent",
    group: "checkout",
    weight: () => 14,
    ruleIntent: "payment_declined",
    intent: "Card payment is declined at checkout.",
    exchanges: [
      [
        "My card keeps getting declined at checkout.",
        "The payment provider returned 'do not honor'. Please try another card or contact your bank to allow the payment.",
      ],
    ],
  },
  {
    key: "coupon",
    agent: "checkout-agent",
    group: "checkout",
    weight: () => 10,
    ruleIntent: "coupon",
    intent: "A discount code is rejected or does not apply to the cart.",
    exchanges: [
      [
        "The code SPRING20 says it's not valid for my cart.",
        "SPRING20 excludes sale items. Removing the discounted jacket will let the code apply to the rest.",
      ],
    ],
  },
  {
    key: "address",
    agent: "checkout-agent",
    group: "checkout",
    weight: () => 8,
    ruleIntent: "address",
    intent: "The shipping address does not validate at checkout.",
    exchanges: [
      [
        "Checkout won't accept my apartment address.",
        "Put the apartment number in the second address line; the validator rejects it in the first line.",
      ],
    ],
  },
];

const TOPICS: Record<string, { name: string; description: string }> = {
  refund_duplicate: {
    name: "Duplicate charge refund",
    description: "Customers charged twice for one order ask for a refund.",
  },
  refund_missing: {
    name: "Refund not received",
    description: "Approved refunds that have not reached the customer yet.",
  },
  refund_partial: {
    name: "Partial refund dispute",
    description: "Refunds that left out shipping fees or a returned item.",
  },
  refund_canceled: {
    name: "Refund for canceled order",
    description: "Orders canceled before shipping that need a full refund.",
  },
  login_password: {
    name: "Password reset",
    description: "Reset emails that do not arrive or links that fail.",
  },
  login_magic: {
    name: "Magic link expired",
    description: "Sign-in links that expired or opened on another device.",
  },
  login_2fa: {
    name: "Two-factor code problems",
    description: "Rejected one-time codes and lost authenticator devices.",
  },
  login_sso: {
    name: "SSO sign-in failures",
    description: "Identity-provider errors during company single sign-on.",
  },
  shipping: {
    name: "Shipping delay",
    description: "Late deliveries and tracking that stopped updating.",
  },
  account: {
    name: "Account details change",
    description: "Changing the account email or company details.",
  },
  payment_declined: {
    name: "Card declined",
    description: "Card payments the provider declines at checkout.",
  },
  coupon: {
    name: "Discount code rejected",
    description: "Codes that are invalid or do not apply to the cart.",
  },
  address: {
    name: "Address validation",
    description: "Shipping addresses the checkout validator rejects.",
  },
  resolved: {
    name: "Resolved",
    description: "The agent solved the request in the conversation.",
  },
  escalated: {
    name: "Escalated to a human",
    description: "The agent handed the case to a support team.",
  },
  unresolved: {
    name: "Unresolved",
    description: "The customer left without a solution.",
  },
  purchased: {
    name: "Purchase completed",
    description: "The customer completed the order.",
  },
  abandoned: {
    name: "Cart abandoned",
    description: "The customer left checkout without paying.",
  },
  policy_unclear: {
    name: "Policy unclear",
    description: "The agent could not explain which policy applies.",
  },
  order_missing: {
    name: "Order data missing",
    description: "The agent could not find the order or payment record.",
  },
  provider_timeout: {
    name: "Payment provider timeout",
    description: "A payment or refund lookup timed out.",
  },
};

const OUTCOME_SUMMARY: Record<string, string> = {
  resolved: "Resolved in the conversation; the customer confirmed the fix.",
  escalated: "Escalated to a human team with the case details attached.",
  unresolved: "Left unresolved; the customer did not get a usable answer.",
  purchased: "The customer completed the purchase after the fix.",
  abandoned: "The customer abandoned checkout.",
};

const ISSUE_SUMMARY: Record<string, string> = {
  policy_unclear: "The agent could not say which refund policy applied.",
  order_missing: "The order lookup returned no record for the reference.",
  provider_timeout: "The payment provider lookup timed out twice.",
};

type SliceTrace = {
  id: string;
  agent: Agent;
  theme: Theme;
  daysAgo: number;
  timestamp: number;
  processedAt: number;
  helpfulness: number;
  outcome: string;
  issue: string | null;
  triggerType: TopicSummary["triggerType"];
  input: string;
  output: string;
};

type FacetRef = { facet: TopicFacet; version: number };
type Member = { trace: SliceTrace; topicKey: string | null };

const iso = (ms: number) => new Date(ms).toISOString();
const stableId = (...parts: string[]) =>
  createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 48);
const hashSeed = (value: string) =>
  Number.parseInt(
    createHash("sha256").update(value).digest("hex").slice(0, 8),
    16,
  );

function unitVector(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => Math.round((value / norm) * 1e6) / 1e6);
}

const centroids = new Map<string, number[]>();
function centroid(key: string): number[] {
  const cached = centroids.get(key);
  if (cached) return cached;
  const rng = new Rng(hashSeed(`centroid:${key}`));
  const vector = unitVector(
    Array.from({ length: DIMENSIONS }, () => rng.next() * 2 - 1),
  );
  centroids.set(key, vector);
  return vector;
}

function embedding(key: string, sourceKey: string): number[] {
  const rng = new Rng(hashSeed(`embedding:${sourceKey}`));
  return unitVector(
    centroid(key).map((value) => value + (rng.next() * 2 - 1) * 0.02),
  );
}

function pickTheme(rng: Rng, agent: Agent, daysAgo: number): Theme {
  const themes = THEMES.filter((theme) => theme.agent === agent);
  const total = themes.reduce((sum, theme) => sum + theme.weight(daysAgo), 0);
  let remaining = rng.next() * total;
  for (const theme of themes) {
    remaining -= theme.weight(daysAgo);
    if (remaining < 0) return theme;
  }
  return themes[themes.length - 1]!;
}

function supportOutcome(rng: Rng, lowHelpfulness: boolean): string {
  const roll = rng.next();
  if (lowHelpfulness) {
    if (roll < 0.5) return "unresolved";
    return roll < 0.85 ? "escalated" : "resolved";
  }
  if (roll < 0.75) return "resolved";
  return roll < 0.92 ? "escalated" : "unresolved";
}

function buildTraces(
  ctx: ScenarioContext,
  anchor: number,
  processingRunAt: number,
): SliceTrace[] {
  const rng = new Rng(ctx.seed);
  const plan: Array<{ agent: Agent; perDay: number; code: string }> = [
    { agent: "support-agent", perDay: 60, code: "sup" },
    { agent: "checkout-agent", perDay: 20, code: "chk" },
  ];
  const traces: SliceTrace[] = [];
  for (const { agent, perDay, code } of plan) {
    let index = 0;
    for (let daysAgo = 0; daysAgo < DAYS; daysAgo++) {
      const spacing = Math.floor((DAY - 3 * HOUR) / perDay);
      for (let slot = 0; slot < perDay; slot++) {
        const theme = pickTheme(rng, agent, daysAgo);
        const timestamp =
          anchor -
          daysAgo * DAY -
          2 * HOUR -
          slot * spacing -
          jitter(ctx.seed, traces.length, 60_000);
        const lowRate = theme.group === "refund" ? 0.85 : 0.1;
        const lowHelpfulness = rng.bool(lowRate);
        const helpfulness = lowHelpfulness
          ? 0.1 + Math.round(rng.next() * 35) / 100
          : 0.6 + Math.round(rng.next() * 38) / 100;
        const exchange = rng.pick(theme.exchanges);
        let outcome = supportOutcome(rng, lowHelpfulness);
        let issue: string | null = null;
        if (agent === "checkout-agent") {
          const abandonRate = theme.key === "payment_declined" ? 0.6 : 0.25;
          outcome = rng.bool(abandonRate) ? "abandoned" : "purchased";
        } else if (rng.bool(theme.group === "refund" ? 0.85 : 0.45)) {
          issue = rng.pick(Object.keys(ISSUE_SUMMARY));
        }
        const processedAt = timestamp + 10 * 60_000;
        traces.push({
          id: `${ctx.idPrefix}-${code}-${index.toString().padStart(3, "0")}`,
          agent,
          theme,
          daysAgo,
          timestamp,
          processedAt,
          helpfulness,
          outcome,
          issue,
          // Support traces before the processing run were summarized by it;
          // later ones and all checkout traces by their rule.
          triggerType:
            agent === "support-agent" && timestamp < processingRunAt
              ? "manual"
              : "automatic",
          input: exchange[0],
          output: exchange[1],
        });
        index++;
      }
    }
  }
  return traces;
}

function topicKeyFor(
  trace: SliceTrace,
  facet: FacetName,
  scope: "rule" | "analysis",
): string | null {
  if (facet === "Intent")
    return scope === "rule" ? trace.theme.ruleIntent : trace.theme.key;
  if (facet === "Outcome") return trace.outcome;
  return trace.issue;
}

function summaryText(trace: SliceTrace, facet: FacetName): string {
  if (facet === "Intent") return trace.theme.intent;
  if (facet === "Outcome") return OUTCOME_SUMMARY[trace.outcome]!;
  return trace.issue
    ? ISSUE_SUMMARY[trace.issue]!
    : "No blocking issue; the agent had what it needed.";
}

/** Writes one completed map: definitions in ClickHouse via the run, then initial assignments. */
async function publishMap(input: {
  projectId: string;
  runId: string;
  facet: FacetRef;
  scope: string;
  members: Member[];
  ruleId: string | null;
  timeRange: TopicTimeRange;
  finishedAt: number;
}): Promise<number> {
  const run = await getTopicRun(input.projectId, input.runId);
  if (!run) throw new SeedError(`Topic run ${input.runId} was not created.`);
  const counts = new Map<string, number>();
  for (const { topicKey } of input.members)
    if (topicKey) counts.set(topicKey, (counts.get(topicKey) ?? 0) + 1);
  const keys = [...counts.keys()].sort(
    (a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b),
  );
  const facetName = input.facet.facet.name;
  const definitions = new Map<string, TopicDefinition>(
    keys.map((key) => [
      key,
      {
        topicVersionId: stableId(run.id, key),
        projectId: input.projectId,
        topicId: stableId(input.scope, facetName, key),
        createdByRunId: run.id,
        createdAt: iso(input.finishedAt),
        tags: [],
        name: TOPICS[key]!.name,
        description: TOPICS[key]!.description,
        centroid: centroid(`${facetName}:${key}`),
        radius: 0.4,
        representativeSummaries: input.members
          .filter((member) => member.topicKey === key)
          .slice(0, 3)
          .map(({ trace }) => ({
            facetId: input.facet.facet.id,
            facetVersion: input.facet.version,
            traceId: trace.id,
            sessionId: null,
          })),
        metadata: {},
      },
    ]),
  );
  await saveTopicRun({
    ...run,
    status: "completed",
    startedAt: iso(input.finishedAt - 3 * 60_000),
    finishedAt: iso(input.finishedAt),
    error: null,
    config: {
      ...run.config,
      exploratory: false,
      embeddingModel: EMBEDDING_MODEL,
      dimensions: DIMENSIONS,
      timeRange: {
        from: input.timeRange.from.toISOString(),
        to: input.timeRange.to.toISOString(),
      },
    },
    topics: [...definitions.values()],
  });
  await prisma.topicClusteringRun.update({
    where: { id: run.id },
    data: { createdAt: new Date(input.finishedAt - 4 * 60_000) },
  });
  const assignments: TopicAssignment[] = input.members.map(
    ({ trace, topicKey }, index) => {
      const definition = topicKey ? definitions.get(topicKey) : undefined;
      const slot = topicKey ? keys.indexOf(topicKey) : keys.length;
      const angle = (2 * Math.PI * slot) / (keys.length + 1);
      const spread = topicKey ? 1.6 : 6;
      const noise = (offset: number) =>
        (jitter(hashSeed(trace.id), index + offset, 2000) / 1000 - 1) * spread;
      const distance = topicKey ? 0.12 + jitter(index, 1, 200) / 1000 : null;
      return {
        projectId: input.projectId,
        facetId: input.facet.facet.id,
        facetVersion: input.facet.version,
        traceId: trace.id,
        sessionId: null,
        environment: ENVIRONMENT,
        traceName: trace.agent,
        unitStartTime: iso(trace.timestamp),
        summaryProcessedAt: iso(trace.processedAt),
        runId: run.id,
        ruleId: input.ruleId,
        topicId: definition?.topicId ?? null,
        topicVersionId: definition?.topicVersionId ?? null,
        distance,
        runnerUpDistance: distance === null ? null : distance + 0.2,
        origin: "initial",
        assignedAt: iso(input.finishedAt),
        coordinates: [
          Math.round((10 * Math.cos(angle) + noise(0)) * 1000) / 1000,
          Math.round((10 * Math.sin(angle) + noise(7)) * 1000) / 1000,
        ],
      };
    },
  );
  await writeTopicAssignments(assignments);
  return assignments.length;
}

async function upsertRule(
  projectId: string,
  rules: TopicRule[],
  input: Pick<TopicRule, "name" | "filter" | "sampling" | "facetIds">,
): Promise<TopicRule> {
  const existing = rules.find((rule) => rule.name === input.name);
  if (!existing && rules.length >= TOPICS_MAX_RULES)
    throw new SeedError(
      `Project already has ${TOPICS_MAX_RULES} Topics rules; cannot add "${input.name}".`,
      "Delete a Topics rule in the project or seed into another project with --project-id.",
    );
  return saveTopicRule({ ...input, projectId, id: existing?.id });
}

const stringFilter = (column: string, value: string) => ({
  column,
  type: "stringOptions" as const,
  operator: "any of" as const,
  value: [value],
});

export async function runTopicSlices(
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
  withV4: boolean,
): Promise<SeedSummary> {
  const startedAt = Date.now();
  const anchor = utcDayStartMs();
  const dayKey = iso(anchor).slice(0, 10);
  const processingRunAt = anchor - 3 * DAY - 4 * HOUR;
  const traces = buildTraces(ctx, anchor, processingRunAt);
  const support = traces.filter((trace) => trace.agent === "support-agent");
  const checkout = traces.filter((trace) => trace.agent === "checkout-agent");
  const supportFacets: FacetName[] = ["Intent", "Outcome", "Issues"];
  const checkoutFacets: FacetName[] = ["Intent", "Outcome"];
  const window = (fromDaysAgo: number, toDaysAgo: number): TopicTimeRange => ({
    from: new Date(anchor - fromDaysAgo * DAY),
    to: new Date(anchor - toDaysAgo * DAY),
  });
  const firstWindow = window(DAYS, 3);
  const secondWindow = window(7, 0);
  const inWindow = (trace: SliceTrace, range: TopicTimeRange) =>
    trace.timestamp >= range.from.getTime() &&
    trace.timestamp < range.to.getTime();
  const lowHelpfulnessRefund = (trace: SliceTrace) =>
    trace.theme.group === "refund" && trace.helpfulness < 0.5;
  const login = (trace: SliceTrace) => trace.theme.group === "login";

  const counts: Record<string, number> = {
    traces: traces.length,
    observations: traces.length,
    events: withV4 ? traces.length * 2 : 0,
    scores: support.length,
    summaries:
      support.length * supportFacets.length +
      checkout.length * checkoutFacets.length,
    rules: 2,
    analysisRuns: 4,
    executions: 5,
  };
  const topicsLink = `${ctx.baseUrl}/project/${ctx.projectId}/topics`;
  const summary = {
    scenario: "topics",
    target: "clickhouse" as const,
    params,
    projectId: ctx.projectId,
    environment: ENVIRONMENT,
    traceIds: traces.map((trace) => trace.id),
    sessionIds: [],
    counts,
    links: [tracesListLink(ctx), topicsLink, `${topicsLink}/rules`],
    dryRun: ctx.dryRun,
  };
  if (ctx.dryRun)
    return { ...summary, verified: {}, durationMs: Date.now() - startedAt };

  const traceRows = traces.map((trace, index) =>
    createTrace({
      id: trace.id,
      project_id: ctx.projectId,
      environment: ENVIRONMENT,
      timestamp: trace.timestamp,
      name: trace.agent,
      session_id: null,
      user_id: `${ctx.idPrefix}-user-${index % 40}`,
      public: false,
      bookmarked: false,
      tags: ["seed", "topics", "slices", trace.theme.group],
      metadata: { scenario: "topics", batch: "slices" },
      input: JSON.stringify([{ role: "user", content: trace.input }]),
      output: JSON.stringify([{ role: "assistant", content: trace.output }]),
      created_at: trace.timestamp,
      updated_at: trace.timestamp + 1800,
      event_ts: trace.timestamp + 1800,
    }),
  );
  const generations = traceRows.map((trace, index) =>
    createObservation({
      id: `${trace.id}-generation`,
      project_id: ctx.projectId,
      trace_id: trace.id,
      environment: ENVIRONMENT,
      parent_observation_id: null,
      type: "GENERATION",
      name: "answer",
      start_time: traces[index]!.timestamp + 50,
      end_time: traces[index]!.timestamp + 1700,
      completion_start_time: traces[index]!.timestamp + 300,
      created_at: traces[index]!.timestamp,
      updated_at: traces[index]!.timestamp + 1800,
      event_ts: traces[index]!.timestamp + 1800,
      input: trace.input,
      output: trace.output,
      metadata: {},
      status_message: null,
      provided_model_name: null,
      internal_model_id: null,
      model_parameters: "{}",
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      provided_usage_details: {},
      usage_details: {},
      provided_cost_details: {},
      cost_details: {},
      total_cost: 0,
    }),
  );
  const events = withV4
    ? traceRows.flatMap((trace, index) => [
        { ...traceToEvent(trace), end_time: generations[index]!.updated_at },
        observationToEvent(generations[index]!, trace),
      ])
    : [];
  const scores = support.map((trace) =>
    createTraceScore({
      id: `${trace.id}-helpfulness`,
      project_id: ctx.projectId,
      trace_id: trace.id,
      observation_id: null,
      environment: ENVIRONMENT,
      name: "helpfulness",
      value: trace.helpfulness,
      data_type: "NUMERIC",
      source: "EVAL",
      comment: null,
      metadata: {},
      timestamp: trace.timestamp + 5 * 60_000,
      created_at: trace.timestamp + 5 * 60_000,
      updated_at: trace.timestamp + 5 * 60_000,
      event_ts: trace.timestamp + 5 * 60_000,
    }),
  );
  ctx.log(
    `writing ${traces.length} traces (slices), ${events.length} events, ${scores.length} scores`,
  );
  await createTracesCh(traceRows);
  await createObservationsCh(generations);
  if (events.length) await createEventsCh(events);
  await createScoresCh(scores);

  const facets = await ensureDefaultTopicFacets(ctx.projectId);
  const facetRef = (name: FacetName): FacetRef => {
    const facet = facets.find((item) => item.isBuiltIn && item.name === name);
    if (!facet?.versions[0])
      throw new SeedError(`Built-in Topics facet "${name}" is missing.`);
    return { facet, version: facet.versions[0].version };
  };
  const refs = (names: FacetName[]) =>
    names.map((name) => {
      const { facet, version } = facetRef(name);
      return { facetId: facet.id, version };
    });

  const summaries: TopicSummary[] = traces.flatMap((trace) =>
    (trace.agent === "support-agent" ? supportFacets : checkoutFacets).map(
      (name) => {
        const { facet, version } = facetRef(name);
        const embeddingKey = topicKeyFor(trace, name, "analysis") ?? "none";
        return {
          projectId: ctx.projectId,
          facetId: facet.id,
          facetVersion: version,
          traceId: trace.id,
          sessionId: null,
          triggerType: trace.triggerType,
          environment: ENVIRONMENT,
          traceName: trace.agent,
          unitStartTime: iso(trace.timestamp),
          state: "complete",
          summary: summaryText(trace, name),
          embedding: embedding(
            `${name}:${embeddingKey}`,
            `${trace.id}:${name}`,
          ),
          transcriptId: trace.id,
          transcriptVersion: "seed",
          summaryModel: SUMMARY_MODEL,
          embeddingModel: EMBEDDING_MODEL,
          providedUsageDetails: {},
          usageDetails: {},
          providedCostDetails: {},
          costDetails: {},
          processedAt: iso(trace.processedAt),
          metadata: { scenario: "topics", batch: "slices" },
        };
      },
    ),
  );
  ctx.log(`writing ${summaries.length} topic summaries`);
  await writeTopicSummaries(summaries);

  const rules = await listTopicRules(ctx.projectId);
  const supportRule = await upsertRule(ctx.projectId, rules, {
    name: "Support agent, prod",
    filter: [
      stringFilter("environment", ENVIRONMENT),
      stringFilter("traceName", "support-agent"),
    ],
    sampling: 0.2,
    facetIds: refs(supportFacets).map(({ facetId }) => facetId),
  });
  const checkoutRule = await upsertRule(
    ctx.projectId,
    await listTopicRules(ctx.projectId),
    {
      name: "Checkout agent, prod",
      filter: [stringFilter("traceName", "checkout-agent")],
      sampling: 1,
      facetIds: refs(checkoutFacets).map(({ facetId }) => facetId),
    },
  );

  const runIds: string[] = [];
  let assignmentCount = 0;
  const ruleMaps = [
    {
      rule: supportRule,
      members: support,
      facets: supportFacets,
      finishedAt: anchor - 50 * 60_000,
    },
    {
      rule: checkoutRule,
      members: checkout,
      facets: checkoutFacets,
      finishedAt: anchor - 20 * 60_000,
    },
  ];
  for (const { rule, members, facets: names, finishedAt } of ruleMaps) {
    const timeRange = window(DAYS, 0);
    for (const name of names) {
      const ref = facetRef(name);
      const id = stableId("rule-run", ctx.projectId, dayKey, rule.id, name);
      await prisma.topicClusteringRun.upsert({
        where: { id },
        create: {
          id,
          projectId: ctx.projectId,
          facetId: ref.facet.id,
          facetVersion: ref.version,
          status: "pending",
          ruleId: rule.id,
          config: {
            timeRange: {
              from: timeRange.from.toISOString(),
              to: timeRange.to.toISOString(),
            },
          },
        },
        update: {},
      });
      runIds.push(id);
      assignmentCount += await publishMap({
        projectId: ctx.projectId,
        runId: id,
        facet: ref,
        scope: `rule:${rule.id}`,
        members: members.map((trace) => ({
          trace,
          topicKey: topicKeyFor(trace, name, "rule"),
        })),
        ruleId: rule.id,
        timeRange,
        finishedAt,
      });
    }
  }

  const executionIds: string[] = [];
  const embeddingConfig = {
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: DIMENSIONS,
  };
  const finishExecution = async (
    execution: Awaited<ReturnType<typeof createTopicExecution>>,
    outcome: "published" | "awaiting_topics",
    requested: number,
    createdAt: number,
    assigned: (facetId: string) => { assigned: number; outlier: number },
  ) => {
    await writeTopicExecution({
      id: execution.id,
      projectId: ctx.projectId,
      status: "completed",
      phase: "completed",
      error: null,
      facets: execution.facets.map((progress) => ({
        ...progress,
        outcome,
        error: null,
        counts: {
          ...progress.counts,
          requested,
          complete: requested,
          ...assigned(progress.facetId),
        },
      })),
    });
    await prisma.batchAction.update({
      where: { id: execution.id },
      data: {
        createdAt: new Date(createdAt),
        finishedAt: new Date(createdAt + 6 * 60_000),
      },
    });
    executionIds.push(execution.id);
  };

  const processed = support.filter(
    (trace) => trace.timestamp < processingRunAt,
  );
  const processing = await createTopicExecution(
    {
      operation: "process",
      projectId: ctx.projectId,
      requestId: `${ctx.idPrefix}-process-${dayKey}`,
      facets: refs(supportFacets),
      embeddingConfig,
      traceIds: processed.map((trace) => trace.id),
      reuseExistingSummaries: true,
      processingConfig: {
        summaryModel: SUMMARY_MODEL,
        maxInputTokens: 120_000,
        maxOutputTokens: 512,
      },
    },
    undefined,
    TOPICS_SYSTEM_USER_ID,
  );
  await finishExecution(
    processing,
    "awaiting_topics",
    processed.length,
    processingRunAt,
    () => ({ assigned: 0, outlier: 0 }),
  );

  const analyses = [
    {
      key: "refunds",
      label: "Refunds with low helpfulness",
      filter: [
        stringFilter("environment", ENVIRONMENT),
        stringFilter("traceName", "support-agent"),
        {
          column: "tags",
          type: "arrayOptions" as const,
          operator: "any of" as const,
          value: ["refund"],
        },
        {
          column: "trace_scores_avg",
          type: "numberObject" as const,
          key: "helpfulness",
          operator: "<" as const,
          value: 0.5,
        },
      ],
      parentRuleId: supportRule.id,
      facets: ["Intent", "Issues"] as FacetName[],
      matches: lowHelpfulnessRefund,
      offset: 0,
    },
    {
      key: "login",
      label: "Login issues → breakdown",
      filter: [
        stringFilter("environment", ENVIRONMENT),
        stringFilter("traceName", "support-agent"),
        {
          column: "tags",
          type: "arrayOptions" as const,
          operator: "any of" as const,
          value: ["login"],
        },
      ],
      parentRuleId: supportRule.id,
      facets: ["Intent"] as FacetName[],
      matches: login,
      offset: 30 * 60_000,
    },
  ];
  const analysisLinks: string[] = [];
  for (const analysis of analyses) {
    let previousExecutionId: string | null = null;
    const runs = [
      { timeRange: firstWindow, createdAt: anchor - 3 * DAY + 2 * HOUR },
      { timeRange: secondWindow, createdAt: anchor - 90 * 60_000 },
    ];
    for (const [runIndex, { timeRange, createdAt }] of runs.entries()) {
      const requestId = `${ctx.idPrefix}-analysis-${analysis.key}-${runIndex + 1}-${dayKey}`;
      const execution = await createTopicExecution(
        {
          operation: "update",
          projectId: ctx.projectId,
          requestId,
          facets: refs(analysis.facets),
          embeddingConfig,
          timeRange,
          exploratory: false,
          analysis: {
            label: analysis.label,
            filter: analysis.filter,
            parentRuleId: analysis.parentRuleId,
            previousExecutionId,
            seed: requestId,
          },
        },
        undefined,
        TOPICS_SYSTEM_USER_ID,
      );
      const cohort = support.filter(
        (trace) => analysis.matches(trace) && inWindow(trace, timeRange),
      );
      const assigned = new Map<string, { assigned: number; outlier: number }>();
      for (const progress of execution.facets) {
        const name = analysis.facets.find(
          (item) => facetRef(item).facet.id === progress.facetId,
        )!;
        const members = cohort.map((trace) => ({
          trace,
          topicKey: topicKeyFor(trace, name, "analysis"),
        }));
        runIds.push(progress.runId!);
        assignmentCount += await publishMap({
          projectId: ctx.projectId,
          runId: progress.runId!,
          facet: facetRef(name),
          scope: `analysis:${analysis.key}`,
          members,
          ruleId: null,
          timeRange,
          finishedAt: createdAt + analysis.offset + 5 * 60_000,
        });
        const outlier = members.filter((member) => !member.topicKey).length;
        assigned.set(progress.facetId, {
          assigned: members.length - outlier,
          outlier,
        });
      }
      await finishExecution(
        execution,
        "published",
        cohort.length,
        createdAt + analysis.offset,
        (facetId) => assigned.get(facetId)!,
      );
      // An analysis is addressed by its first run; reruns chain from it.
      if (!previousExecutionId)
        analysisLinks.push(`${topicsLink}?map=analysis:${execution.id}`);
      previousExecutionId = execution.id;
    }
  }

  const traceIds = traces.map((trace) => trace.id);
  const queryParams = { projectId: ctx.projectId, traceIds, runIds };
  const traceScope =
    "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}";
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      "project_id = {projectId: String} AND id IN {traceIds: Array(String)}",
      queryParams,
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      traceScope,
      queryParams,
      "uniqExact(id)",
    ),
    events: withV4
      ? await countRows(
          "events_full",
          traceScope,
          queryParams,
          "uniqExact(span_id)",
        )
      : 0,
    scores: await countRows("scores", traceScope, queryParams, "uniqExact(id)"),
    summaries: await countRows(
      "topic_facet_summaries",
      traceScope,
      queryParams,
      "uniqExact(trace_id, facet_id)",
    ),
    assignments: await countRows(
      "topic_assignments",
      `${traceScope} AND clustering_run_id IN {runIds: Array(String)}`,
      queryParams,
      "uniqExact(trace_id, facet_id, clustering_run_id)",
    ),
    rules: (await listTopicRules(ctx.projectId)).filter((rule) =>
      [supportRule.id, checkoutRule.id].includes(rule.id),
    ).length,
    analysisRuns: await prisma.batchAction.count({
      where: {
        projectId: ctx.projectId,
        id: { in: executionIds },
        actionType: TOPICS_CLUSTER_ACTION,
      },
    }),
    executions: await prisma.batchAction.count({
      where: {
        projectId: ctx.projectId,
        id: { in: executionIds },
        status: "COMPLETED",
      },
    }),
    maps: await prisma.topicClusteringRun.count({
      where: {
        projectId: ctx.projectId,
        id: { in: runIds },
        status: "completed",
      },
    }),
  };
  counts.assignments = assignmentCount;
  counts.maps = runIds.length;
  for (const [entity, expected] of Object.entries(counts)) {
    if (verified[entity] !== expected) {
      throw new SeedError(
        `Readback mismatch: expected ${expected} ${entity}, found ${verified[entity]}`,
      );
    }
  }
  return {
    ...summary,
    links: [
      ...summary.links,
      `${topicsLink}?map=rule:${supportRule.id}`,
      `${topicsLink}?map=rule:${checkoutRule.id}`,
      ...analysisLinks,
    ],
    verified,
    durationMs: Date.now() - startedAt,
  };
}
