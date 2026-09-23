import { prisma, Prisma } from "../../db";
import {
  topicRuleConfigSchema,
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
      description: "The task requested for this run.",
      prompt:
        "Describe only what this run was asked to accomplish: the requested action or answer, its subject, and constraints that materially change the task. Phrase it as a goal, not a completed action. Exclude the response, tool execution, failures, and eventual result, even when they dominate the recording. Earlier context may clarify the current request but should not introduce unrelated tasks. For automated runs, use the task evident in the input rather than inventing a human requester. Whenever a requested task or question is identifiable, return applicable and describe that goal, even when execution failed or outputs are missing. If the request cannot be established, use insufficient_input. Example: a request to export monthly sales followed by a permission error has applicable intent: Export monthly sales. The permission error does not belong in the intent summary.",
    },
    {
      name: "Outcome",
      description: "The result actually visible at the end of the run.",
      prompt:
        "Describe what this run actually delivered or where it stopped, using the final response and execution results. For an explanation or analysis task, the delivered explanation is the outcome; the situation being explained is not an event in this run. Distinguish a proposed action, an assistant's completion claim, and a confirming result. A returned draft is an observable deliverable; it does not prove a downstream action occurred. Mention remaining work only when the recording establishes it. Preserve the concrete result rather than reducing it to a success or failure label. A delivered response, a confirmed action, or an evidenced blockage is applicable, including failed or partial results. If outputs are missing and no result can be established, use insufficient_input with an empty summary. Examples: a returned explanation of a database error is an applicable delivered explanation; a failed export with a suggested workaround is an applicable blocked export. An input request without any recorded response or execution result is insufficient_input.",
    },
    {
      name: "Issues",
      description: "Observed problems, their consequences, and recovery.",
      prompt:
        "Determine whether a problem occurred in the execution or response of this run. If the run has adequate evidence and no problem, return not_applicable with an empty summary; do not summarize its success. An error quoted in input for explanation is not an error of this run. Missing logs, an appropriate refusal, and routine clarification alone are not defects. If the recording is too incomplete to judge, return insufficient_input with an empty summary. An observed tool error or response defect is applicable even if the agent recovered. Describe the principal observed problem, the operation it affected, and its consequence. Include recovery when shown. Treat complaints as reports, not proof of an underlying cause. Keep related symptoms together; prioritize the most consequential problem when independent problems compete. Examples: an export tool returning permission denied is applicable; accurately explaining a permission error pasted by the user is not_applicable; a recording containing only the initial request is insufficient_input.",
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

export async function listTopicRuns(projectId: string): Promise<TopicRun[]> {
  const rows = await prisma.topicClusteringRun.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return hydrateRuns(projectId, rows);
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
      if (!isEqual(existing, topic))
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
      if (!isEqual(saved.get(topic.topicVersionId), topic))
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
