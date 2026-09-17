import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "../../db";
import {
  topicProcessingConfigSchema,
  type TopicFacet,
  type TopicFacetVersion,
  type TopicRun,
  type TopicProcessingConfig,
  type TopicDefinition,
} from "../../topics";
import { readTopicArtifact, writeTopicArtifact } from "./journal";
import { chunk } from "lodash";

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
    processingConfig: topicProcessingConfigSchema.parse(row.processingConfig),
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
  processingConfig?: Partial<TopicProcessingConfig>;
}

export async function createTopicFacet(
  input: FacetVersionInput & { name: string; description: string },
): Promise<TopicFacet> {
  const config = topicProcessingConfigSchema.parse(
    input.processingConfig ?? {},
  );
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
        processingConfig: config,
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
    const config = topicProcessingConfigSchema.parse({
      ...topicProcessingConfigSchema.parse(last?.processingConfig ?? {}),
      ...input.processingConfig,
    });
    return tx.topicFacetVersion.create({
      data: {
        projectId: input.projectId,
        facetId: input.facetId,
        version: (last?.version ?? 0) + 1,
        prompt: input.prompt.trim(),
        processingConfig: config,
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
      description: "What the user is trying to accomplish.",
      projection: "intent" as const,
      prompt:
        "Describe the user's concrete goal, requested task, and distinguishing subject matter. Use only the trace evidence. Do not categorize the request or judge whether it succeeded.",
    },
    {
      name: "Issues",
      description: "Problems evidenced by the interaction.",
      projection: "issues" as const,
      prompt:
        "Describe problems actually evidenced by errors, tool results, or the final response, including recovery when shown. Do not infer a failure from missing information. Return not_applicable when no issue is evidenced, or insufficient_input when the available evidence cannot support a judgment.",
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
          processingConfig: { projection: preset.projection },
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

async function runResult(row: RunRow): Promise<TopicRun> {
  const manifest = await readTopicArtifact<{ summaryIds: string[] }>(
    row.projectId,
    "runs",
    row.id,
  );
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
  id?: string;
  projectId: string;
  facetVersionId: string;
  config?: Record<string, unknown>;
  summaryIds?: string[];
  manifestPath?: string;
  artifactPath?: string;
}): Promise<TopicRun> {
  const id = input.id ?? randomUUID();
  const existing = await getTopicRun(input.projectId, id);
  if (existing) {
    if (existing.facetVersionId !== input.facetVersionId)
      throw new Error("Run facet version cannot change.");
    return existing;
  }
  if (!(await getTopicFacetVersion(input.projectId, input.facetVersionId)))
    throw new Error("Facet version not found.");
  if (input.summaryIds?.length)
    await writeTopicArtifact(input.projectId, "runs", id, {
      summaryIds: input.summaryIds,
    });
  const row = await prisma.topicClusteringRun.create({
    data: {
      id,
      projectId: input.projectId,
      facetVersionId: input.facetVersionId,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
      manifestPath: input.manifestPath ?? `runs/${id}.json`,
      artifactPath: input.artifactPath ?? "",
    },
    include: { topics: true },
  });
  return runResult(row);
}

export async function saveTopicRun(run: TopicRun): Promise<TopicRun> {
  if (run.summaryIds.length)
    await writeTopicArtifact(run.projectId, "runs", run.id, {
      summaryIds: run.summaryIds,
    });
  const row = await prisma.$transaction(async (tx) => {
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
    await tx.topic.deleteMany({
      where: { projectId: run.projectId, runId: run.id },
    });
    if (run.topics.length)
      await tx.topic.createMany({
        data: run.topics.map((topic) => ({
          ...topic,
          metadata: topic.metadata as Prisma.InputJsonValue,
        })),
      });
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
