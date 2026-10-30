import { prisma, Prisma } from "../../db";
import {
  DEFAULT_TOPIC_FACETS,
  TOPICS_MAX_RULES,
  topicRuleSettingsSchema,
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
import { TopicsTargetObject } from "../../features/evals/types";
import {
  invalidateTopicsProcessingActive,
  topicRuleWhere,
} from "./processing-gate";

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
  const presets = DEFAULT_TOPIC_FACETS;
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
  ...topicRuleSettingsSchema.parse({
    filter: row.filter,
    sampling: Number(row.sampling),
  }),
  facetIds: row.assignments.map((assignment) => assignment.evaluatorId),
  updatedAt: row.updatedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  enabled: row.status === "ACTIVE",
});

/** Oldest first: the first rule is the project's setup rule and owns pre-rule maps. */
export async function listTopicRules(projectId: string): Promise<TopicRule[]> {
  return (
    await prisma.evaluationRule.findMany({
      where: topicRuleWhere(projectId),
      include: { assignments: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
  ).map(topicRule);
}

export async function setTopicRuleEnabled(
  projectId: string,
  id: string,
  enabled: boolean,
): Promise<TopicRule> {
  const updated = await prisma.evaluationRule.updateMany({
    where: { ...topicRuleWhere(projectId), id },
    data: { status: enabled ? "ACTIVE" : "INACTIVE" },
  });
  if (!updated.count)
    throw new InvalidRequestError("Topic rule not found in this project.");
  await invalidateTopicsProcessingActive(projectId);
  return (await getTopicRule(projectId, id))!;
}

/**
 * Serving-map scope of one rule. Runs written before rules carry neither a
 * rule nor an analysis and belong to the project's oldest rule.
 */
export async function topicRuleRunWhere(
  projectId: string,
  ruleId: string,
): Promise<Prisma.TopicClusteringRunWhereInput> {
  const oldest = await prisma.evaluationRule.findFirst({
    where: topicRuleWhere(projectId),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return oldest?.id === ruleId
    ? { OR: [{ ruleId }, { ruleId: null, batchActionId: null }] }
    : { ruleId };
}

/** Latest finished refit per rule, for "Updated … · next refit in …". */
export async function getTopicRuleRefits(
  projectId: string,
): Promise<Map<string, Date>> {
  const rules = await listTopicRules(projectId);
  const refits = new Map<string, Date>();
  for (const rule of rules) {
    const run = await prisma.topicClusteringRun.findFirst({
      where: {
        projectId,
        status: "completed",
        ...(await topicRuleRunWhere(projectId, rule.id)),
      },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    if (run?.finishedAt) refits.set(rule.id, run.finishedAt);
  }
  return refits;
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

/**
 * A project has at most TOPICS_MAX_RULES Topics rules. Postgres has no
 * constraint for this, so writers hold this per-project lock while they count
 * rules; otherwise two concurrent creates could exceed the limit.
 */
async function lockProjectTopicRule(
  tx: Prisma.TransactionClient,
  projectId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`topics-rule:${projectId}`}, 0))`;
}

export type TopicRuleInput = Omit<
  TopicRule,
  "id" | "name" | "updatedAt" | "sampling"
> &
  Partial<Pick<TopicRule, "name" | "sampling">> & {
    id?: string;
    /** The user saving the rule; recorded when it is created. */
    userId?: string | null;
  };

export async function saveTopicRule(input: TopicRuleInput): Promise<TopicRule> {
  const rule = await prisma.$transaction((tx) => writeTopicRule(tx, input));
  await invalidateTopicsProcessingActive(input.projectId);
  return rule;
}

/** Writes the project's rule inside the caller's transaction, under its lock. */
export async function writeTopicRule(
  tx: Prisma.TransactionClient,
  input: TopicRuleInput,
): Promise<TopicRule> {
  const facetIds = [...new Set(input.facetIds)];
  await lockProjectTopicRule(tx, input.projectId);
  const facetCount = await tx.evaluator.count({
    where: {
      projectId: input.projectId,
      type: "FACET",
      id: { in: facetIds },
    },
  });
  if (!facetIds.length || facetCount !== facetIds.length)
    throw new InvalidRequestError("Select facets from this project.");
  const rules = await tx.evaluationRule.findMany({
    where: topicRuleWhere(input.projectId),
    select: { id: true, name: true, sampling: true },
  });
  const existing = input.id
    ? rules.find((rule) => rule.id === input.id)
    : undefined;
  if (input.id && !existing)
    throw new InvalidRequestError("Topic rule not found in this project.");
  if (!existing && rules.length >= TOPICS_MAX_RULES)
    throw new InvalidRequestError(
      `A project can have at most ${TOPICS_MAX_RULES} Topics rules.`,
    );
  const ruleId = existing?.id;
  const name = input.name?.trim() || existing?.name || "All traces";
  // Sampling belongs to automatic processing; a write without it keeps the rate.
  const config = topicRuleSettingsSchema.parse({
    ...input,
    sampling:
      input.sampling ?? (existing ? Number(existing.sampling) : undefined),
  });
  const data = {
    name,
    filter: JSON.parse(JSON.stringify(config.filter)) as Prisma.InputJsonValue,
    sampling: config.sampling,
    delay: 0,
    targetObject: TopicsTargetObject,
    timeScope: ["NEW"],
  };
  const assignments = facetIds.map((evaluatorId) => ({
    projectId: input.projectId,
    evaluatorId,
  }));
  const row = ruleId
    ? await tx.evaluationRule.update({
        where: { ...topicRuleWhere(input.projectId), id: ruleId },
        data: {
          ...data,
          assignments: { deleteMany: {}, create: assignments },
        },
        include: { assignments: true },
      })
    : await tx.evaluationRule.create({
        data: {
          ...data,
          status: "ACTIVE",
          projectId: input.projectId,
          createdByUserId: input.userId ?? null,
          assignments: { create: assignments },
        },
        include: { assignments: true },
      });
  return topicRule(row);
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
    ruleId: row.ruleId,
    batchActionId: row.batchActionId,
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

/** Without a rule, any rule's latest map serves; analyses never do. */
async function servingRunWhere(
  projectId: string,
  ruleId: string | undefined,
): Promise<Prisma.TopicClusteringRunWhereInput> {
  return ruleId
    ? topicRuleRunWhere(projectId, ruleId)
    : { batchActionId: null };
}

export async function getPublishedTopicRun(
  projectId: string,
  facetId: string,
  ruleId?: string,
): Promise<TopicRun | null> {
  const row = await prisma.topicClusteringRun.findFirst({
    where: {
      projectId,
      facetId,
      status: "completed",
      ...(await servingRunWhere(projectId, ruleId)),
    },
    orderBy: servingMapOrder,
  });
  return row ? (await hydrateRuns(projectId, [row]))[0] : null;
}

/** Capture compatible serving-map IDs without reading their ClickHouse cohorts. */
export async function getTopicProcessingMapIds(
  projectId: string,
  facets: TopicFacetRef[],
  embeddingConfig: TopicEmbeddingConfig,
  ruleId?: string,
): Promise<{ facetId: string; facetVersion: number; runId: string | null }[]> {
  if (!facets.length) return [];
  const runs = await prisma.topicClusteringRun.findMany({
    where: {
      projectId,
      facetId: { in: [...new Set(facets.map((facet) => facet.facetId))] },
      status: "completed",
      ...(await servingRunWhere(projectId, ruleId)),
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
  ruleId?: string | null;
  batchActionId?: string | null;
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
      ruleId: input.ruleId ?? null,
      batchActionId: input.batchActionId ?? null,
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
    assertDefinitionsReadBack(missing, saved);
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

/** Throws unless every new definition reads back identically, naming what differs. */
function assertDefinitionsReadBack(
  missing: TopicDefinition[],
  saved: Map<string, TopicDefinition>,
): void {
  const mismatched = missing.filter(
    (topic) => !sameTopicDefinition(saved.get(topic.topicVersionId), topic),
  );
  if (mismatched.length === 0) return;
  const differences = new Set(
    mismatched.flatMap((topic) =>
      definitionDifferences(saved.get(topic.topicVersionId), topic),
    ),
  );
  throw new TopicDefinitionReadbackError(
    `Topic definition readback did not match for ${mismatched.length} of ${missing.length} new definitions (${[...differences].join(", ")}).`,
  );
}

/** A written definition did not read back identically; the message names fields, never values. */
export class TopicDefinitionReadbackError extends Error {
  readonly name = "TopicDefinitionReadbackError";
}

/** Names what differs between a stored definition and its candidate, including metadata keys. */
function definitionDifferences(
  stored: TopicDefinition | undefined,
  candidate: TopicDefinition,
): string[] {
  if (!stored) return ["not readable"];
  const differs = (left: object, right: object, key: string) =>
    key in left !== key in right ||
    !isEqual(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    );
  const differences = sameTopicGeometry(stored, candidate) ? [] : ["geometry"];
  const fields = new Set([...Object.keys(stored), ...Object.keys(candidate)]);
  for (const field of fields) {
    if (field === "centroid" || field === "radius" || field === "metadata")
      continue;
    if (differs(stored, candidate, field)) differences.push(field);
  }
  const keys = new Set([
    ...Object.keys(stored.metadata),
    ...Object.keys(candidate.metadata),
  ]);
  for (const key of keys)
    if (differs(stored.metadata, candidate.metadata, key))
      differences.push(`metadata.${key}`);
  return differences;
}
