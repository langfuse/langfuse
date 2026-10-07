import { prisma, Prisma } from "../../db";
import {
  topicRuleConfigSchema,
  topicTimeRangeSchema,
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
import { EvalTargetObject } from "../../features/evals/types";

type FacetVersionRow = Prisma.EvaluatorVersionGetPayload<object>;
type FacetRow = Prisma.EvaluatorGetPayload<{ include: { versions: true } }>;
type RunRow = Prisma.TopicClusteringRunGetPayload<object>;

function facetVersion(
  row: FacetVersionRow,
  projectId: string,
): TopicFacetVersion {
  if (row.prompt === null) throw new Error("Facet version has no prompt.");
  return {
    projectId,
    facetId: row.evaluatorId,
    version: row.version,
    prompt: row.prompt,
    createdAt: row.createdAt.toISOString(),
  };
}

function topicFacet(row: FacetRow): TopicFacet {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description ?? "",
    isBuiltIn: row.isBuiltIn,
    versions: row.versions.map((version) =>
      facetVersion(version, row.projectId),
    ),
  };
}

export async function listTopicFacets(
  projectId: string,
): Promise<TopicFacet[]> {
  const rows = await prisma.evaluator.findMany({
    where: { projectId, type: "FACET" },
    include: { versions: { orderBy: { version: "desc" } } },
    // A stable order keeps the Topics summary prompt (and its cache) identical across traces.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(topicFacet);
}

export async function getTopicFacetVersion(
  projectId: string,
  facetId: string,
  version: number,
): Promise<TopicFacetVersion | null> {
  const row = await prisma.evaluatorVersion.findFirst({
    where: {
      evaluatorId: facetId,
      version,
      evaluator: { projectId, type: "FACET" },
    },
  });
  return row ? facetVersion(row, projectId) : null;
}

interface FacetVersionInput {
  projectId: string;
  prompt: string;
}

export async function createTopicFacet(
  input: FacetVersionInput & { name: string; description: string },
): Promise<TopicFacet> {
  const row = await prisma.evaluator.create({
    data: {
      projectId: input.projectId,
      type: "FACET",
      name: input.name.trim(),
      description: input.description.trim(),
      versions: { create: { version: 1, prompt: input.prompt.trim() } },
    },
    include: { versions: true },
  });
  return topicFacet(row);
}

export async function createTopicFacetVersion(
  input: FacetVersionInput & { facetId: string },
): Promise<TopicFacetVersion> {
  const row = await prisma.$transaction(async (tx) => {
    const facets = await tx.$queryRaw<
      { id: string; isBuiltIn: boolean }[]
    >`SELECT id, is_built_in AS "isBuiltIn" FROM evaluators
      WHERE project_id = ${input.projectId} AND id = ${input.facetId} AND type = 'FACET'
      FOR UPDATE`;
    if (!facets.length)
      throw new InvalidRequestError("Facet not found in this project.");
    if (facets[0].isBuiltIn)
      throw new InvalidRequestError("Built-in facets cannot be changed.");
    const last = await tx.evaluatorVersion.findFirst({
      where: { evaluatorId: input.facetId },
      orderBy: { version: "desc" },
    });
    if (last?.prompt === input.prompt.trim()) return last;
    return tx.evaluatorVersion.create({
      data: {
        evaluatorId: input.facetId,
        version: (last?.version ?? 0) + 1,
        prompt: input.prompt.trim(),
      },
    });
  });
  return facetVersion(row, input.projectId);
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
      prompt: `Describe the problem that did the most damage to the result of this run: the mistake that made the final answer or action wrong, unsupported, or missing.

Format: one sentence that names the mistake, the kind of step where it happened, and its consequence, for example "Answered from memory instead of querying the dataset, so the reported value is unverified."
- Describe the mechanism in plain, generic words: what the assistant did wrong and how, such as answering from memory, inventing data, claiming a check that never ran, choosing the wrong tool, breaking a required format, or stopping before the answer. Use the words that fit this run.
- Name the kind of step (a web search, a file read, a calculation, a code change, the final answer), not the task's subject. "Skipped the file read and guessed the count" is right; "gave a wrong count of crustacean slides" is not.
- Do not start with a label or category.

How to find it:
- Start from the end. Check the final answer or action against the request: is it on target, complete, and backed by what the run actually retrieved or did? Then work back to the step that caused the gap.
- Report the cause with its consequence, not the symptom. When a tool fails and the assistant then answers anyway from guesses or invented data, the problem is the unsupported answer, not the tool failure.
- When several problems occur, report the one with the biggest effect on the result. Prefer, in this order: an answer or reported result that is wrong or not backed by the run; a task left unfinished or answered off target; a wrong tool, approach, or argument; a broken instruction or format; a tool failure that blocked the result. A problem the assistant fully recovered from counts only when nothing worse happened.
- Keep the symptoms of one problem together; do not list separate problems.

Before you return not_applicable, check these four points. Return not_applicable only when all of them hold:
1. When the request depends on data, files, tools, or current facts that the run had to look up, every such fact, number, or result in the final answer comes from a tool result or user input in this run, not from memory or assumption. General knowledge, explanations, and writing do not need a lookup.
2. Every tool call used a tool suited to its input, such as a file tool on a local file rather than a web address, with valid arguments.
3. The run followed the output format, tags, and steps that the system prompt or the assistant's own plan required.
4. The final answer addresses exactly what was asked: the right quantity, unit, entity, and scope.

- Only problems in this run count. An error the user pastes for explanation, a problem in earlier conversation, or a complaint about something outside the run is not an issue here.
- A clarifying question, a justified refusal, a short answer, and a retry that succeeds are not issues.
- Check the end of this run before calling it unfinished: if a later assistant message delivers an answer or fallback, the run is finished.
- Report only what the transcript shows directly. A run-specific fact that needed a lookup but has none is shown directly. A problem that is only a possibility is not.

Status: not_applicable when the run is complete enough to judge and shows no problem. insufficient_input when too much is missing to judge, for example only the first request survives.

Examples:
- Answered from a made-up example after the data file could not be read, so the reported result is invented.
- Reported the total instead of the requested minimum, so the answer misses the question.
- Searched the web for figures the attached spreadsheet contained, so the answer used outdated data.
- Every inventory lookup timed out, so no quote could be produced and the user was asked to retry later.`,
    },
  ];
  const facets = await listTopicFacets(projectId);
  if (
    presets.every((preset) =>
      facets.some((facet) => facet.isBuiltIn && facet.name === preset.name),
    )
  )
    return facets;
  await prisma.$transaction(async (tx) => {
    const projects = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
    if (!projects.length) throw new InvalidRequestError("Project not found.");
    const existing = await tx.evaluator.findMany({
      where: { projectId, type: "FACET", isBuiltIn: true },
      select: { name: true },
    });
    for (const { prompt, ...preset } of presets) {
      if (!existing.some((facet) => facet.name === preset.name))
        await tx.evaluator.create({
          data: {
            projectId,
            ...preset,
            type: "FACET",
            isBuiltIn: true,
            versions: { create: { version: 1, prompt } },
          },
        });
    }
  });
  return listTopicFacets(projectId);
}

type RuleRow = Prisma.EvaluationRuleGetPayload<{
  include: { assignments: true };
}>;
const topicRule = (row: RuleRow): TopicRule => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  ...topicRuleConfigSchema.parse(row),
  facetIds: row.assignments.map((assignment) => assignment.evaluatorId),
  updatedAt: row.updatedAt.toISOString(),
});

function topicRuleWhere(projectId: string): Prisma.EvaluationRuleWhereInput {
  return {
    projectId,
    targetObject: EvalTargetObject.TRACE,
    assignments: {
      some: {},
      every: { projectId, evaluator: { projectId, type: "FACET" } },
    },
  };
}

export async function listTopicRules(projectId: string): Promise<TopicRule[]> {
  return (
    await prisma.evaluationRule.findMany({
      where: topicRuleWhere(projectId),
      include: { assignments: true },
      orderBy: { updatedAt: "desc" },
    })
  ).map(topicRule);
}

export async function getTopicRule(
  projectId: string,
  id: string,
): Promise<TopicRule | null> {
  const row = await prisma.evaluationRule.findFirst({
    where: { ...topicRuleWhere(projectId), id },
    include: { assignments: true },
  });
  return row ? topicRule(row) : null;
}

export async function saveTopicRule(
  input: Omit<TopicRule, "id" | "updatedAt"> & { id?: string },
): Promise<TopicRule> {
  const facetIds = [...new Set(input.facetIds)];
  return prisma.$transaction(async (tx) => {
    const facetCount = await tx.evaluator.count({
      where: {
        projectId: input.projectId,
        type: "FACET",
        id: { in: facetIds },
      },
    });
    if (!facetIds.length || facetCount !== facetIds.length)
      throw new InvalidRequestError("Select facets from this project.");
    if (
      input.id &&
      !(await tx.evaluationRule.findFirst({
        where: { ...topicRuleWhere(input.projectId), id: input.id },
      }))
    )
      throw new InvalidRequestError("Topic rule not found in this project.");
    const config = topicRuleConfigSchema.parse(input);
    const data = {
      name: input.name.trim(),
      filter: JSON.parse(
        JSON.stringify(config.filter),
      ) as Prisma.InputJsonValue,
      sampling: 1,
      delay: 0,
      idleTime: null,
      targetObject: EvalTargetObject.TRACE,
      timeScope: ["NEW"],
      status: "ACTIVE" as const,
    };
    const assignments = facetIds.map((evaluatorId) => ({
      projectId: input.projectId,
      evaluatorId,
    }));
    const row = input.id
      ? await tx.evaluationRule.update({
          where: { ...topicRuleWhere(input.projectId), id: input.id },
          data: {
            ...data,
            assignments: { deleteMany: {}, create: assignments },
          },
          include: { assignments: true },
        })
      : await tx.evaluationRule.create({
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
  if (!ids.length) return rows.map((row) => runResult(row, new Map()));
  const ranges = rows
    .filter((row) => row.topicVersionIds.length)
    .map((row) =>
      topicTimeRangeSchema.parse(
        (row.config as Record<string, unknown>).definitionTimeRange,
      ),
    );
  const definitions = new Map(
    (
      await getTopicDefinitions(projectId, ids, {
        from: new Date(Math.min(...ranges.map(({ from }) => from.getTime()))),
        to: new Date(Math.max(...ranges.map(({ to }) => to.getTime()))),
      })
    ).map((topic) => [topic.topicVersionId, topic]),
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

export async function getTopicRuns(
  projectId: string,
  ids: string[],
): Promise<TopicRun[]> {
  if (!ids.length) return [];
  const rows = await prisma.topicClusteringRun.findMany({
    where: { projectId, id: { in: ids } },
  });
  return hydrateRuns(projectId, rows);
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
  if (
    !(await getTopicFacetVersion(
      input.projectId,
      input.facetId,
      input.facetVersion,
    ))
  )
    throw new InvalidRequestError("Facet version not found in this project.");
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
  const definitionTimes = run.topics.map((topic) =>
    Date.parse(topic.createdAt),
  );
  const definitionTimeRange = definitionTimes.length
    ? topicTimeRangeSchema.parse({
        from: new Date(Math.min(...definitionTimes)),
        to: new Date(Math.max(...definitionTimes) + 1),
      })
    : null;
  const config = { ...run.config };
  if (definitionTimeRange)
    config.definitionTimeRange = {
      from: definitionTimeRange.from.toISOString(),
      to: definitionTimeRange.to.toISOString(),
    };
  else delete config.definitionTimeRange;
  const saved = new Map(
    (definitionTimeRange
      ? await getTopicDefinitions(
          run.projectId,
          topicVersionIds,
          definitionTimeRange,
        )
      : []
    ).map((topic) => [topic.topicVersionId, topic]),
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
      definitionTimeRange!,
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
        config: config as Prisma.InputJsonValue,
        error: run.error,
        startedAt:
          existing.startedAt ??
          (run.startedAt ? new Date(run.startedAt) : null),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      },
    });
  });
  return row.topicVersionIds.every((id) => saved.has(id))
    ? runResult(row, saved)
    : (await hydrateRuns(run.projectId, [row]))[0];
}
