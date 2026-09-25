import { prisma, Prisma } from "../../db";
import {
  topicRuleConfigSchema,
  sameTopicGeometry,
  type TopicFacet,
  type TopicFacetRef,
  type TopicFacetVersion,
  type TopicRun,
  type TopicRule,
  type TopicDefinition,
  type TopicEmbeddingConfig,
} from "../../topics";
import { isEqual } from "lodash";
import { getTopicDefinitions, writeTopicDefinitions } from "./clickhouse";
import { InvalidRequestError } from "../../errors";

type FacetVersionRow = Prisma.FacetVersionGetPayload<object>;
type RunRow = Prisma.TopicClusteringRunGetPayload<object>;

function facetVersion(row: FacetVersionRow): TopicFacetVersion {
  return {
    projectId: row.projectId,
    facetId: row.facetId,
    version: row.version,
    prompt: row.prompt,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTopicFacets(
  projectId: string,
): Promise<TopicFacet[]> {
  const rows = await prisma.facet.findMany({
    where: { projectId },
    include: { versions: { orderBy: { version: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    projectId,
    name: row.name,
    description: row.description,
    versions: row.versions.map(facetVersion),
  }));
}

export async function getTopicFacetVersion(
  projectId: string,
  facetId: string,
  version: number,
): Promise<TopicFacetVersion | null> {
  const row = await prisma.facetVersion.findFirst({
    where: { projectId, facetId, version },
  });
  return row ? facetVersion(row) : null;
}

interface FacetVersionInput {
  projectId: string;
  prompt: string;
}

export async function createTopicFacet(
  input: FacetVersionInput & { name: string; description: string },
): Promise<TopicFacet> {
  const row = await prisma.$transaction(async (tx) => {
    const facet = await tx.facet.create({
      data: {
        projectId: input.projectId,
        name: input.name.trim(),
        description: input.description.trim(),
      },
    });
    const version = await tx.facetVersion.create({
      data: {
        projectId: input.projectId,
        facetId: facet.id,
        version: 1,
        prompt: input.prompt.trim(),
      },
    });
    return { ...facet, versions: [version] };
  });
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    versions: row.versions.map(facetVersion),
  };
}

export async function createTopicFacetVersion(
  input: FacetVersionInput & { facetId: string },
): Promise<TopicFacetVersion> {
  const row = await prisma.$transaction(async (tx) => {
    const facets = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM facets WHERE project_id = ${input.projectId} AND id = ${input.facetId} FOR UPDATE`;
    if (!facets.length) throw new Error("Facet not found.");
    const last = await tx.facetVersion.findFirst({
      where: { projectId: input.projectId, facetId: input.facetId },
      orderBy: { version: "desc" },
    });
    if (last?.prompt === input.prompt.trim()) return last;
    return tx.facetVersion.create({
      data: {
        projectId: input.projectId,
        facetId: input.facetId,
        version: (last?.version ?? 0) + 1,
        prompt: input.prompt.trim(),
      },
    });
  });
  return facetVersion(row);
}

export async function ensureDefaultTopicFacets(
  projectId: string,
): Promise<TopicFacet[]> {
  const presets = [
    {
      name: "Intent",
      description: "What the run was asked to do.",
      prompt: `Describe what the user, or the calling application, wanted from this run as a whole.

Format: an imperative verb phrase stating the goal, such as "Find…", "Fix…", "Summarize…".

- Describe the goal of the whole run, not its last step. Follow-up requests to verify, save, show, fix, or reformat earlier work belong to the goal they serve.
- A run can contain several unrelated requests, for example a user who finishes one job and then starts another. Name each of them in a few words, in the order they were asked, joined with "and". Describing only the latest request misses the earlier ones.
- Earlier conversation can clarify the goals of this run but does not add goals of its own.
- In an automated run with no human author (extraction, classification, routing, templated generation), describe the job the input sets. Do not invent a person asking for it.
- When the user asks the assistant to work on supplied material, describe that work and name the material's subject in a few words.
- Keep the user's own verb and object. "Fix the date filter in a SQL query" must not become "Improve a data workflow".
- Describe goals only. Leave out how the assistant approached them, what went wrong, and whether they succeeded.
- Social or casual messages have a goal too; state it plainly.

Status: applicable whenever a goal can be identified, even if the run failed or produced nothing. insufficient_input when no request or input survives. Do not use not_applicable.

Examples:
- Export last quarter's orders to CSV grouped by region.
- Classify an inbound support email by product area and urgency.
- Fix a failing nightly data import and draft a welcome email for new customers.
- Chat about plans for the weekend.`,
    },
    {
      name: "Sentiment",
      description: "How the end user felt about the interaction.",
      prompt: `Describe how the end user felt about this interaction and what the feeling was directed at.

Format: "<Label>: <cue and its target>", where Label is one of:
- Positive: thanks, praise, relief, or warm engagement.
- Negative: frustration, annoyance, distrust, or giving up.
- Mixed: both are substantial, for example annoyance that turns into relief.
- Neutral: factual or procedural messages with no emotional signal.

- Judge only text the end user wrote. Assistant, tool, and system text shows what the user reacts to, never how the user feels.
- Judge the attitude toward the interaction, not the subject. A calm report of a bug, a failed test, or a personal hardship is not negative by itself.
- Weight sustained tone and how the user ends over a single remark. Terse or strict instructions are Neutral; so is routine politeness.
- Name the target in terms of the assistant's behavior (wrong answers, slow progress, ignored corrections, a working fix), not the user's private circumstances.

Status: not_applicable when the run has no end-user text, as in automated pipelines. insufficient_input when user text exists but is unreadable.

Examples:
- Negative: user repeated the same formatting correction and said the assistant keeps ignoring it.
- Positive: user thanked the assistant after a working fix for a failing deployment script.
- Mixed: user was annoyed by two wrong answers, then relieved when the third one worked.
- Neutral: user gave step-by-step instructions without emotional cues.`,
    },
    {
      name: "Outcome",
      description: "Where the run ended and whether that is confirmed.",
      prompt: `Describe where this run ended: what was delivered or done, and whether the transcript confirms it.

Format: "<State>: <the concrete result>", where State is one of:
- Completed: the requested answer was given, or a tool result confirms the requested action.
- Partial: part of the request was delivered and part was not.
- Unconfirmed: the assistant says an action happened, but no result confirms it.
- Needs input: the run ends waiting on the user, such as a clarifying question or an approval.
- Not completed: the run stopped, was blocked, or was declined without delivering the request.

- Start from the end of this run: the last assistant message and the last tool results decide the state.
- Base the state on results, not on the assistant's words. A tool result confirms an action; a message saying "done" does not. A returned draft is a delivered draft, not a sent message.
- For questions, explanations, and analyses, the delivered answer is the result.
- Name the concrete deliverable or stopping point, not just the state. Mention remaining work only when the transcript shows it.
- Say where the run stopped, not why something failed, unless the reason is itself the result, as with a declined request.

Status: applicable whenever the run has a final response or result, including failures. insufficient_input when no response or result survives. Do not use not_applicable.

Examples:
- Completed: returned a SQL query that filters orders by signup month.
- Unconfirmed: said the meeting was booked, but no calendar tool result confirms it.
- Needs input: asked which of two accounts the transfer should come from.
- Not completed: stopped after the payments tool failed, without answering the user.`,
    },
    {
      name: "Issues",
      description: "The main problem in how the run was handled.",
      prompt: `Describe the most consequential problem in how the assistant or application handled this run.

Format: "<Category>: <what went wrong, where, and its consequence>", where Category is one of:
- Tool error: a tool call failed, timed out, or returned an error.
- Wrong action: the assistant called the wrong tool, passed wrong arguments, or acted on the wrong item.
- Unsupported claim: the assistant stated a fact or reported an action the transcript does not back, such as "done" without a confirming result.
- Ignored instruction: the run breaks a rule, format, or correction the user or system gave, or skips a step the assistant's own plan committed to.
- Off target: the response answers a different request or assumes a premise the conversation does not support.
- Unfinished: the run stops after a tool call or mid-answer, with no final response.
- Repetition: the assistant repeats the same step without progress.
- Unhelpful refusal: the assistant declines a reasonable request without trying.
- Exposed reasoning: the visible reply contains internal reasoning or thinking tags. Reasoning parts are internal and do not count.

- Only problems in this run count. An error the user pastes for explanation, a problem in earlier conversation, or a complaint about something outside the run is not an issue here.
- A clarifying question, a justified refusal, a short answer, and a retry that succeeds are not issues. If the assistant recovered from a real problem, report it and mention the recovery.
- Check the end of this run before calling it Unfinished: if a later assistant message delivers an answer or fallback, the run is finished.
- Compare what the assistant did with the rules it was given and the plan it stated. Breaking an explicit rule, skipping a planned step, or using a different tool than planned is an issue even when the run otherwise succeeds.
- Report only what the transcript shows directly. If a problem is only a possibility, return not_applicable.
- Report one problem. Keep related symptoms together.

Status: not_applicable when the run is complete enough to judge and shows no problem. insufficient_input when too much is missing to judge, for example only the first request survives.

Examples:
- Tool error: inventory lookup timed out, so the quote left out stock levels; the assistant asked the user to retry.
- Unsupported claim: assistant confirmed a refund was issued, but no refund tool was called.
- Ignored instruction: user asked for metric units, but the answer used imperial units throughout.`,
    },
  ];
  for (const preset of presets) {
    try {
      const existing = await prisma.facet.findUnique({
        where: { projectId_name: { projectId, name: preset.name } },
      });
      if (!existing)
        await createTopicFacet({
          projectId,
          ...preset,
        });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
      )
        throw error;
    }
  }
  return listTopicFacets(projectId);
}

type RuleRow = Prisma.FacetRuleGetPayload<{ include: { assignments: true } }>;
const topicRule = (row: RuleRow): TopicRule => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  ...topicRuleConfigSchema.parse(row),
  facetIds: row.assignments.map((assignment) => assignment.facetId),
  updatedAt: row.updatedAt.toISOString(),
});

export async function listTopicRules(projectId: string): Promise<TopicRule[]> {
  return (
    await prisma.facetRule.findMany({
      where: { projectId },
      include: { assignments: true },
      orderBy: { updatedAt: "desc" },
    })
  ).map(topicRule);
}

export async function getTopicRule(
  projectId: string,
  id: string,
): Promise<TopicRule | null> {
  const row = await prisma.facetRule.findFirst({
    where: { projectId, id },
    include: { assignments: true },
  });
  return row ? topicRule(row) : null;
}

export async function saveTopicRule(
  input: Omit<TopicRule, "id" | "updatedAt"> & { id?: string },
): Promise<TopicRule> {
  const facetIds = [...new Set(input.facetIds)];
  return prisma.$transaction(async (tx) => {
    const facets = await tx.facet.findMany({
      where: { projectId: input.projectId, id: { in: facetIds } },
      select: { id: true },
    });
    if (!facetIds.length || facets.length !== facetIds.length)
      throw new InvalidRequestError("Select facets from this project.");
    if (
      input.id &&
      !(await tx.facetRule.findFirst({
        where: { projectId: input.projectId, id: input.id },
      }))
    )
      throw new InvalidRequestError("Topic rule not found in this project.");
    const config = topicRuleConfigSchema.parse(input);
    const data = {
      name: input.name.trim(),
      filter: JSON.parse(
        JSON.stringify(config.filter),
      ) as Prisma.InputJsonValue,
      sampling: config.sampling,
      limit: config.limit,
    };
    const assignments = facetIds.map((facetId) => ({ facetId }));
    const row = input.id
      ? await tx.facetRule.update({
          where: { projectId_id: { projectId: input.projectId, id: input.id } },
          data: {
            ...data,
            assignments: { deleteMany: {}, create: assignments },
          },
          include: { assignments: true },
        })
      : await tx.facetRule.create({
          data: {
            ...data,
            projectId: input.projectId,
            assignments: { create: assignments },
          },
          include: { assignments: true },
        });
    return topicRule(row);
  });
}

function runResult(
  row: RunRow,
  definitions: Map<string, TopicDefinition>,
): TopicRun {
  return {
    id: row.id,
    projectId: row.projectId,
    facetId: row.facetId,
    facetVersion: row.facetVersion,
    status: row.status as TopicRun["status"],
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    config: row.config as Record<string, unknown>,
    error: row.error,
    topics: row.topicVersionIds.map((id) => {
      const topic = definitions.get(id);
      if (!topic || topic.projectId !== row.projectId)
        throw new Error("Topic run references a missing definition.");
      return topic;
    }),
  };
}

async function hydrateRuns(
  projectId: string,
  rows: RunRow[],
): Promise<TopicRun[]> {
  const ids = rows.flatMap((row) => row.topicVersionIds);
  const definitions = new Map(
    (await getTopicDefinitions(projectId, ids)).map((topic) => [
      topic.topicVersionId,
      topic,
    ]),
  );
  return rows.map((row) => runResult(row, definitions));
}

export async function getTopicRun(
  projectId: string,
  id: string,
): Promise<TopicRun | null> {
  const row = await prisma.topicClusteringRun.findFirst({
    where: { projectId, id },
  });
  return row ? (await hydrateRuns(projectId, [row]))[0] : null;
}

// Higher facet versions win; a late-finishing older run cannot replace a newer map.
const servingMapOrder = [
  { facetVersion: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.TopicClusteringRunOrderByWithRelationInput[];

export async function getPublishedTopicRun(
  projectId: string,
  facetId: string,
): Promise<TopicRun | null> {
  const row = await prisma.topicClusteringRun.findFirst({
    where: { projectId, facetId, status: "completed" },
    orderBy: servingMapOrder,
  });
  return row ? (await hydrateRuns(projectId, [row]))[0] : null;
}

/** Capture compatible serving-map IDs without reading their ClickHouse cohorts. */
export async function getTopicProcessingMapIds(
  projectId: string,
  facets: TopicFacetRef[],
  embeddingConfig: TopicEmbeddingConfig,
): Promise<{ facetId: string; facetVersion: number; runId: string | null }[]> {
  if (!facets.length) return [];
  const runs = await prisma.topicClusteringRun.findMany({
    where: {
      projectId,
      facetId: { in: [...new Set(facets.map((facet) => facet.facetId))] },
      status: "completed",
    },
    orderBy: servingMapOrder,
    distinct: ["facetId"],
    select: { id: true, facetId: true, facetVersion: true, config: true },
  });
  return facets.map(({ facetId, version }) => {
    const run = runs.find((run) => run.facetId === facetId);
    const config = run?.config as Record<string, unknown> | undefined;
    return {
      facetId,
      facetVersion: version,
      runId:
        run?.facetVersion === version &&
        config?.embeddingModel === embeddingConfig.embeddingModel &&
        config?.dimensions === embeddingConfig.embeddingDimensions
          ? run.id
          : null,
    };
  });
}

export async function createTopicRun(input: {
  projectId: string;
  facetId: string;
  facetVersion: number;
  config: Record<string, unknown>;
}): Promise<TopicRun> {
  const row = await prisma.topicClusteringRun.create({
    data: {
      projectId: input.projectId,
      facetId: input.facetId,
      facetVersion: input.facetVersion,
      config: input.config as Prisma.InputJsonValue,
    },
  });
  return runResult(row, new Map());
}

function sameTopicDefinition(
  stored: TopicDefinition | undefined,
  candidate: TopicDefinition,
): boolean {
  if (!stored || !sameTopicGeometry(stored, candidate)) return false;
  return isEqual(
    { ...stored, centroid: candidate.centroid, radius: candidate.radius },
    candidate,
  );
}

export async function saveTopicRun(run: TopicRun): Promise<TopicRun> {
  const stored = await prisma.topicClusteringRun.findFirst({
    where: { projectId: run.projectId, id: run.id },
  });
  if (
    !stored ||
    stored.facetId !== run.facetId ||
    stored.facetVersion !== run.facetVersion
  )
    throw new Error("Run not found or facet version mismatch.");
  if (stored.status === "completed" || stored.status === "skipped")
    return (await hydrateRuns(run.projectId, [stored]))[0];
  const topicVersionIds = run.topics.map((topic) => topic.topicVersionId);
  if (
    new Set(topicVersionIds).size !== topicVersionIds.length ||
    new Set(run.topics.map((topic) => topic.topicId)).size !== run.topics.length
  )
    throw new Error("Topic run contains duplicate definitions.");
  const saved = new Map(
    (await getTopicDefinitions(run.projectId, topicVersionIds)).map((topic) => [
      topic.topicVersionId,
      topic,
    ]),
  );
  const missing: TopicDefinition[] = [];
  for (const topic of run.topics) {
    if (topic.projectId !== run.projectId)
      throw new Error("Invalid topic definition.");
    const existing = saved.get(topic.topicVersionId);
    if (existing) {
      if (!sameTopicDefinition(existing, topic))
        throw new Error("Topic definitions cannot change.");
    } else {
      if (topic.createdByRunId !== run.id)
        throw new Error("Topic run references a missing definition.");
      missing.push(topic);
    }
  }
  if (missing.length) {
    // Definitions must be readable before Postgres can publish their membership.
    await writeTopicDefinitions(missing);
    const inserted = await getTopicDefinitions(
      run.projectId,
      missing.map((topic) => topic.topicVersionId),
    );
    for (const topic of inserted) saved.set(topic.topicVersionId, topic);
    for (const topic of missing) {
      if (!sameTopicDefinition(saved.get(topic.topicVersionId), topic))
        throw new Error("Topic definition readback did not match.");
    }
  }
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM topic_clustering_runs WHERE project_id = ${run.projectId} AND id = ${run.id} FOR UPDATE`;
    const existing = await tx.topicClusteringRun.findFirst({
      where: { projectId: run.projectId, id: run.id },
    });
    if (
      !existing ||
      existing.facetId !== run.facetId ||
      existing.facetVersion !== run.facetVersion
    )
      throw new Error("Run not found or facet version mismatch.");
    if (existing.status === "completed" || existing.status === "skipped")
      return existing;
    return tx.topicClusteringRun.update({
      where: { id: run.id, projectId: run.projectId },
      data: {
        topicVersionIds,
        status: run.status,
        config: run.config as Prisma.InputJsonValue,
        error: run.error,
        startedAt:
          existing.startedAt ??
          (run.startedAt ? new Date(run.startedAt) : null),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      },
    });
  });
  return (await hydrateRuns(run.projectId, [row]))[0];
}
