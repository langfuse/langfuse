import { JobConfigState, prisma, Prisma } from "../../db";
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
import {
  getTopicDefinitions,
  getTopicNames,
  writeTopicDefinitions,
} from "./clickhouse";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { TopicsTargetObject } from "../../features/evals/types";
import { topicRuleWhere } from "./processing-gate";
import { invalidateProjectEvalConfigCaches } from "../evalJobConfigCache";

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

/** `activeOnly` leaves out paused rules, which select no new traces. */
export async function listTopicRules(
  projectId: string,
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<TopicRule[]> {
  return (
    await prisma.evaluationRule.findMany({
      where: {
        ...topicRuleWhere(projectId),
        ...(activeOnly ? { status: JobConfigState.ACTIVE } : {}),
      },
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
  await invalidateProjectEvalConfigCaches(projectId);
  return (await getTopicRule(projectId, id))!;
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
  "id" | "name" | "updatedAt" | "sampling" | "filter"
> &
  Partial<Pick<TopicRule, "name" | "sampling" | "filter">> & {
    id?: string;
    /** The user saving the rule; recorded when it is created. */
    userId?: string | null;
    /** Setup's rule: updates the first rule if a concurrent save created it. */
    firstRule?: boolean;
  };

export async function saveTopicRule(input: TopicRuleInput): Promise<TopicRule> {
  const rule = await prisma.$transaction((tx) => writeTopicRule(tx, input));
  await invalidateProjectEvalConfigCaches(input.projectId);
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
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, sampling: true, filter: true },
  });
  const existing = input.id
    ? rules.find((rule) => rule.id === input.id)
    : (input.firstRule && rules[0]) || undefined;
  if (input.id && !existing)
    throw new InvalidRequestError("Topic rule not found in this project.");
  if (!existing && rules.length >= TOPICS_MAX_RULES)
    throw new InvalidRequestError(
      `A project can have at most ${TOPICS_MAX_RULES} Topics rules.`,
    );
  const ruleId = existing?.id;
  const name = input.name?.trim() || existing?.name || "All traces";
  // A write without sampling or a filter keeps the rule's stored rate and filter.
  const config = topicRuleSettingsSchema.parse({
    ...input,
    sampling:
      input.sampling ?? (existing ? Number(existing.sampling) : undefined),
    filter: input.filter ?? existing?.filter ?? [],
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
  const definitions = new Map(
    (await getTopicDefinitions(projectId, ids, definitionTimeRange(rows))).map(
      (topic) => [topic.topicVersionId, topic],
    ),
  );
  return rows.map((row) => runResult(row, definitions));
}

// Definitions are written when their run completes, inside the run's stored range.
function definitionTimeRange(rows: RunRow[]) {
  const ranges = rows
    .filter((row) => row.topicVersionIds.length)
    .map((row) =>
      topicTimeRangeSchema.parse(
        (row.config as Record<string, unknown>).definitionTimeRange,
      ),
    );
  return {
    from: new Date(Math.min(...ranges.map(({ from }) => from.getTime()))),
    to: new Date(Math.max(...ranges.map(({ to }) => to.getTime()))),
  };
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

/**
 * Each facet's serving map: the newest facet version wins, and within it a
 * rule's continuous map wins over every other run. One-off snapshots and runs
 * without an owner serve, newest first, only until such a map exists.
 */
async function findServingRuns(projectId: string, facetIds: string[]) {
  const runs = await Promise.all(
    [...new Set(facetIds)].map(async (facetId) => {
      // Analyses never serve; runs without the key predate them.
      const where = {
        projectId,
        facetId,
        status: "completed",
        config: { path: ["analysis"], equals: Prisma.DbNull },
      };
      // One row per query: a facet gains a completed run with every refit.
      const newest = await prisma.topicClusteringRun.findFirst({
        where,
        orderBy: servingMapOrder,
      });
      if (!newest || newest.ruleId !== null) return newest;
      const map = await prisma.topicClusteringRun.findFirst({
        where: {
          ...where,
          facetVersion: newest.facetVersion,
          ruleId: { not: null },
        },
        orderBy: servingMapOrder,
      });
      return map ?? newest;
    }),
  );
  return runs.filter((run) => run !== null);
}

export async function getPublishedTopicRun(
  projectId: string,
  facetId: string,
): Promise<TopicRun | null> {
  const [row] = await findServingRuns(projectId, [facetId]);
  return row ? (await hydrateRuns(projectId, [row]))[0] : null;
}

type CurrentTopicMap = { ruleId: string | null; run: RunRow };

/**
 * Each rule's current map of the facets, as the Topics map picker shows them.
 * The oldest rule also shows setup's snapshot until its first fit, though online
 * assignment writes only to rule-owned maps; a facet no rule covers keeps its
 * serving map.
 */
export async function getCurrentTopicMapRows(
  projectId: string,
  facetIds: string[],
): Promise<CurrentTopicMap[]> {
  if (!facetIds.length) return [];
  const [rules, serving] = await Promise.all([
    listTopicRules(projectId),
    findServingRuns(projectId, facetIds),
  ]);
  const maps = await Promise.all(
    [...new Set(facetIds)].flatMap(
      (facetId): Promise<CurrentTopicMap | null>[] => {
        const fallback = serving.find((run) => run.facetId === facetId) ?? null;
        const owners = rules.filter((rule) => rule.facetIds.includes(facetId));
        if (!owners.length)
          return [Promise.resolve(fallback && { ruleId: null, run: fallback })];
        return owners.map(async (rule) => {
          const own = await getTopicRuleMapRow(projectId, rule.id, facetId);
          const run =
            own ??
            (rule.id === rules[0]?.id && fallback && !fallback.ruleId
              ? fallback
              : null);
          return run && { ruleId: rule.id, run };
        });
      },
    ),
  );
  const unique = new Map<string, CurrentTopicMap>();
  for (const map of maps) if (map) unique.set(map.run.id, map);
  return [...unique.values()];
}

/** Current map IDs of the facets; current results count only these runs' assignments. */
export async function getPublishedTopicRunIds(
  projectId: string,
  facetIds: string[],
): Promise<string[]> {
  return (await getCurrentTopicMapRows(projectId, facetIds)).map(
    ({ run }) => run.id,
  );
}

/** The current maps of `getCurrentTopicMapRows` with their topic names and ids. */
export async function getPublishedTopicMaps(
  projectId: string,
  facetIds: string[],
) {
  const unique = (await getCurrentTopicMapRows(projectId, facetIds)).map(
    ({ run }) => run,
  );
  const ids = unique.flatMap((run) => run.topicVersionIds);
  // Only names and ids: these reads run on every tracing request with topics.
  const names = new Map(
    (ids.length
      ? await getTopicNames(projectId, ids, definitionTimeRange(unique))
      : []
    ).map((topic) => [topic.topicVersionId, topic]),
  );
  return {
    runIds: unique.map(({ id }) => id),
    maps: unique.map((run) => ({
      facetId: run.facetId,
      topics: run.topicVersionIds.flatMap((id) => names.get(id) ?? []),
    })),
  };
}

/** Capture compatible serving-map IDs without reading their ClickHouse cohorts. */
export async function getTopicProcessingMapIds(
  projectId: string,
  facets: TopicFacetRef[],
  embeddingConfig: TopicEmbeddingConfig,
): Promise<{ facetId: string; facetVersion: number; runId: string | null }[]> {
  if (!facets.length) return [];
  const runs = await findServingRuns(projectId, [
    ...new Set(facets.map((facet) => facet.facetId)),
  ]);
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
  id?: string;
  projectId: string;
  facetId: string;
  facetVersion: number;
  config: Record<string, unknown>;
  status?: "pending" | "skipped";
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
      id: input.id,
      projectId: input.projectId,
      facetId: input.facetId,
      facetVersion: input.facetVersion,
      config: input.config as Prisma.InputJsonValue,
      status: input.status ?? "pending",
      ruleId: input.ruleId ?? null,
      batchActionId: input.batchActionId ?? null,
      finishedAt: input.status === "skipped" ? new Date() : null,
    },
  });
  return runResult(row, new Map());
}

/**
 * Runs of one rule's continuous map. Runs written before rules carry neither a
 * rule nor a snapshot and belong to the project's oldest rule.
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

/** The rule's published map row of a facet, without reading its topics. */
export async function getTopicRuleMapRow(
  projectId: string,
  ruleId: string,
  facetId: string,
) {
  return prisma.topicClusteringRun.findFirst({
    where: {
      projectId,
      facetId,
      status: "completed",
      ...(await topicRuleRunWhere(projectId, ruleId)),
    },
    orderBy: servingMapOrder,
  });
}

/** The rule's published map of a facet, at any facet version. */
export async function getTopicRuleMap(
  projectId: string,
  ruleId: string,
  facetId: string,
): Promise<TopicRun | null> {
  const row = await getTopicRuleMapRow(projectId, ruleId, facetId);
  return row ? (await hydrateRuns(projectId, [row]))[0] : null;
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
