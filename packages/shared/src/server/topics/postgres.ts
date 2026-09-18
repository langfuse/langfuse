import { prisma, Prisma } from "../../db";
import {
  topicRuleConfigSchema,
  type TopicFacet,
  type TopicFacetVersion,
  type TopicRun,
  type TopicRule,
  type TopicDefinition,
} from "../../topics";
import { readTopicArtifact, writeTopicArtifact } from "./journal";
import { chunk, isEqual } from "lodash";
import { InvalidRequestError } from "../../errors";

type FacetVersionRow = Prisma.TopicFacetVersionGetPayload<object>;
type RunRow = Prisma.TopicClusteringRunGetPayload<{
  include: { topics: true };
}>;

function facetVersion(row: FacetVersionRow): TopicFacetVersion {
  return {
    id: row.id,
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
  const rows = await prisma.topicFacet.findMany({
    where: { projectId },
    include: { versions: { orderBy: { version: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    projectId,
    name: row.name,
    description: row.description,
    publishedRunId: row.publishedRunId,
    versions: row.versions.map(facetVersion),
  }));
}

export async function getTopicFacetVersion(
  projectId: string,
  id: string,
): Promise<TopicFacetVersion | null> {
  const row = await prisma.topicFacetVersion.findFirst({
    where: { projectId, id },
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
    const facet = await tx.topicFacet.create({
      data: {
        projectId: input.projectId,
        name: input.name.trim(),
        description: input.description.trim(),
      },
    });
    const version = await tx.topicFacetVersion.create({
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
    publishedRunId: row.publishedRunId,
    versions: row.versions.map(facetVersion),
  };
}

export async function createTopicFacetVersion(
  input: FacetVersionInput & { facetId: string },
): Promise<TopicFacetVersion> {
  const row = await prisma.$transaction(async (tx) => {
    const facets = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM topic_facets WHERE project_id = ${input.projectId} AND id = ${input.facetId} FOR UPDATE`;
    if (!facets.length) throw new Error("Facet not found.");
    const last = await tx.topicFacetVersion.findFirst({
      where: { projectId: input.projectId, facetId: input.facetId },
      orderBy: { version: "desc" },
    });
    if (last?.prompt === input.prompt.trim()) return last;
    return tx.topicFacetVersion.create({
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
      const existing = await prisma.topicFacet.findUnique({
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

type RuleRow = Prisma.TopicRuleGetPayload<{ include: { assignments: true } }>;
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
    await prisma.topicRule.findMany({
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
  const row = await prisma.topicRule.findFirst({
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
    const facets = await tx.topicFacet.findMany({
      where: { projectId: input.projectId, id: { in: facetIds } },
      select: { id: true },
    });
    if (!facetIds.length || facets.length !== facetIds.length)
      throw new InvalidRequestError("Select facets from this project.");
    if (
      input.id &&
      !(await tx.topicRule.findFirst({
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
      ? await tx.topicRule.update({
          where: { projectId_id: { projectId: input.projectId, id: input.id } },
          data: {
            ...data,
            assignments: { deleteMany: {}, create: assignments },
          },
          include: { assignments: true },
        })
      : await tx.topicRule.create({
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

async function runResult(row: RunRow): Promise<TopicRun> {
  const manifest = row.manifestPath
    ? await readTopicArtifact<{ summaryIds: string[] }>(
        row.projectId,
        row.executionId,
        row.manifestPath,
      )
    : null;
  return {
    id: row.id,
    projectId: row.projectId,
    facetVersionId: row.facetVersionId,
    runSequence: row.runSequence.toString(),
    status: row.status as TopicRun["status"],
    phase: row.phase,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    config: row.config as Record<string, unknown>,
    summaryIds: manifest?.summaryIds ?? [],
    manifestPath: row.manifestPath,
    artifactPath: row.artifactPath,
    metrics: row.metrics as Record<string, unknown>,
    error: row.error,
    topics: row.topics.map((topic) => ({
      ...topic,
      metadata: topic.metadata as Record<string, unknown>,
    })),
  };
}

export async function getTopicRun(
  projectId: string,
  id: string,
): Promise<TopicRun | null> {
  const row = await prisma.topicClusteringRun.findFirst({
    where: { projectId, id },
    include: { topics: true },
  });
  return row ? runResult(row) : null;
}

export async function getPublishedTopicRun(
  projectId: string,
  facetId: string,
): Promise<TopicRun | null> {
  const facet = await prisma.topicFacet.findFirst({
    where: { projectId, id: facetId },
    select: { publishedRunId: true },
  });
  if (!facet?.publishedRunId) return null;
  const row = await prisma.topicClusteringRun.findFirst({
    where: {
      projectId,
      id: facet.publishedRunId,
      status: "completed",
      publishedAt: { not: null },
      facetVersion: { facetId },
    },
    include: { topics: true },
  });
  return row ? runResult(row) : null;
}

export async function getTopicDefinitions(
  projectId: string,
  topicVersionIds: string[],
): Promise<TopicDefinition[]> {
  const definitions: TopicDefinition[] = [];
  for (const ids of chunk([...new Set(topicVersionIds)], 1000)) {
    const rows = await prisma.topic.findMany({
      where: { projectId, topicVersionId: { in: ids } },
    });
    definitions.push(
      ...rows.map((row) => ({
        ...row,
        metadata: row.metadata as Record<string, unknown>,
      })),
    );
  }
  return definitions;
}

export async function listTopicRuns(
  projectId: string,
  facetVersionId?: string,
): Promise<TopicRun[]> {
  const rows = await prisma.topicClusteringRun.findMany({
    where: { projectId, ...(facetVersionId ? { facetVersionId } : {}) },
    include: { topics: true },
    orderBy: { runSequence: "desc" },
    take: 100,
  });
  return Promise.all(rows.map(runResult));
}

export async function createTopicRun(input: {
  id: string;
  projectId: string;
  facetVersionId: string;
  config?: Record<string, unknown>;
  summaryIds?: string[];
  manifestPath?: string;
  artifactPath?: string;
}): Promise<TopicRun> {
  const { id, projectId } = input;
  const existing = await prisma.topicClusteringRun.findFirst({
    where: { projectId, id },
    include: { topics: true },
  });
  if (!existing)
    throw new Error("Create the Topics execution before configuring its run.");
  if (existing.facetVersionId !== input.facetVersionId)
    throw new Error("Run facet version cannot change.");
  if (existing.publishedAt || existing.manifestPath) return runResult(existing);
  const manifestPath = input.manifestPath ?? `manifest-${id}`;
  if (input.summaryIds)
    await writeTopicArtifact(projectId, existing.executionId, manifestPath, {
      summaryIds: input.summaryIds,
    });
  const row = await prisma.topicClusteringRun.update({
    where: { projectId_id: { projectId, id } },
    data: {
      config: (input.config ?? {}) as Prisma.InputJsonValue,
      manifestPath: input.summaryIds ? manifestPath : "",
      artifactPath: input.artifactPath ?? "",
    },
    include: { topics: true },
  });
  return runResult(row);
}

export async function saveTopicRun(run: TopicRun): Promise<TopicRun> {
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM topic_clustering_runs WHERE project_id = ${run.projectId} AND id = ${run.id} FOR UPDATE`;
    const existing = await tx.topicClusteringRun.findFirst({
      where: { projectId: run.projectId, id: run.id },
      include: { topics: true, facetVersion: true },
    });
    if (!existing || existing.facetVersionId !== run.facetVersionId)
      throw new Error("Run not found or facet version mismatch.");
    if (existing.publishedAt) return existing;
    for (const topic of run.topics) {
      if (
        topic.projectId !== run.projectId ||
        topic.runId !== run.id ||
        !topic.centroid.length ||
        !topic.centroid.every(Number.isFinite) ||
        !Number.isFinite(topic.radius) ||
        topic.radius < 0
      )
        throw new Error("Invalid topic definition.");
    }
    if (run.publishedAt && run.status !== "completed")
      throw new Error("Only a completed map can be published.");
    if (run.startedAt) {
      await tx.topicClusteringRun.updateMany({
        where: { projectId: run.projectId, id: run.id, startedAt: null },
        data: { startedAt: new Date(run.startedAt) },
      });
    }
    for (const topic of run.topics) {
      if (
        isEqual(
          existing.topics.find(
            (saved) => saved.topicVersionId === topic.topicVersionId,
          ),
          topic,
        )
      )
        continue;
      const data = {
        ...topic,
        metadata: topic.metadata as Prisma.InputJsonValue,
      };
      await tx.topic.upsert({
        where: {
          topicVersionId: topic.topicVersionId,
          projectId: run.projectId,
          runId: run.id,
        },
        create: data,
        update: data,
      });
    }
    const updated = await tx.topicClusteringRun.update({
      where: { projectId_id: { projectId: run.projectId, id: run.id } },
      data: {
        status: run.status,
        phase: run.phase,
        config: run.config as Prisma.InputJsonValue,
        metrics: run.metrics as Prisma.InputJsonValue,
        error: run.error,
        artifactPath: run.artifactPath,
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
        publishedAt: run.publishedAt ? new Date(run.publishedAt) : null,
      },
      include: { topics: true },
    });
    if (run.publishedAt) {
      await tx.$queryRaw`SELECT id FROM topic_facets WHERE project_id = ${run.projectId} AND id = ${existing.facetVersion.facetId} FOR UPDATE`;
      const facet = await tx.topicFacet.findFirstOrThrow({
        where: { projectId: run.projectId, id: existing.facetVersion.facetId },
      });
      const current = facet.publishedRunId
        ? await tx.topicClusteringRun.findFirst({
            where: { projectId: run.projectId, id: facet.publishedRunId },
            include: { facetVersion: true },
          })
        : null;
      if (
        !current ||
        existing.facetVersion.version > current.facetVersion.version ||
        (existing.facetVersion.version === current.facetVersion.version &&
          existing.runSequence > current.runSequence)
      ) {
        await tx.topicFacet.update({
          where: { projectId_id: { projectId: run.projectId, id: facet.id } },
          data: { publishedRunId: run.id },
        });
      }
    }
    return updated;
  });
  return runResult(row);
}
