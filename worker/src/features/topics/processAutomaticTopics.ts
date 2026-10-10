import { prisma } from "@langfuse/shared/src/db";
import type { TopicAutomaticJob } from "@langfuse/shared/src/server";
import {
  topicEmbeddingConfigSchema,
  topicExecutionInputSchema,
  type TopicEmbeddingConfig,
  type TopicFacetRef,
  type TopicRun,
  type TopicSummary,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import {
  createAutomaticTopicExecution,
  enqueueAutomaticTopicDiscovery,
  getPublishedTopicRun,
  getTopicClusteringSummaries,
  getTopicProcessingMapIds,
  getTopicRun,
  getTopicSummaryCounts,
  getTopicsModelConfig,
  isTopicsProjectEnabled,
  listTopicFacets,
  listTopicSummaries,
  readTopicAssignments,
  readTopicExecutionSummary,
  writeTopicAssignments,
} from "@langfuse/shared/topics/server";
import { topicAssignments } from "./assignments";
import { processTopicsExecution } from "./processTopicsExecution";
import { topicClusterSettings } from "./numeric";

export async function processAutomaticTopics(
  data: TopicAutomaticJob,
  saveUpdateInput: (
    input: NonNullable<TopicAutomaticJob["updateInput"]>,
  ) => Promise<void>,
): Promise<void> {
  const { projectId, traceIds } = data.payload;
  const to = new Date();
  // Waiting and delayed discovery requests coalesce without replacing payloads.
  const timeRange = traceIds
    ? data.payload.timeRange
    : { from: new Date(to.getTime() - 7 * 86400000), to };
  if (!isTopicsProjectEnabled(projectId)) return;
  if (
    !(await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    }))
  )
    return;
  const currentFacets = (await listTopicFacets(projectId)).flatMap((facet) =>
    facet.versions[0]
      ? [{ facetId: facet.id, version: facet.versions[0].version }]
      : [],
  );
  const facets: TopicFacetRef[] =
    data.updateInput?.facets ?? data.payload.facets ?? currentFacets;
  if (!facets.length) return;
  const models = getTopicsModelConfig();
  if (!models.embeddingModel)
    throw new Error(
      "Configure LANGFUSE_TOPICS_EMBEDDING_MODEL before processing Topics.",
    );
  const currentEmbeddingConfig = topicEmbeddingConfigSchema.parse({
    embeddingModel: models.embeddingModel,
  });
  const embeddingConfig = topicEmbeddingConfigSchema.parse(
    data.updateInput?.embeddingConfig ??
      (traceIds ? data.payload.embeddingConfig : undefined) ??
      currentEmbeddingConfig,
  );
  const complete = (
    rows: TopicSummary[],
    facet: TopicFacetRef,
    range: TopicTimeRange,
    config: TopicEmbeddingConfig = embeddingConfig,
  ) =>
    rows.filter(
      (row) =>
        row.projectId === projectId &&
        row.facetId === facet.facetId &&
        row.facetVersion === facet.version &&
        row.state === "complete" &&
        row.traceId !== null &&
        row.embeddingModel === config.embeddingModel &&
        row.embedding.length === config.embeddingDimensions &&
        Date.parse(row.unitStartTime) >= range.from.getTime() &&
        Date.parse(row.unitStartTime) < range.to.getTime(),
    );
  const assign = async (
    facet: TopicFacetRef,
    run: TopicRun,
    rows: TopicSummary[],
    config: TopicEmbeddingConfig = embeddingConfig,
  ) => {
    if (!rows.length) return;
    if (run.status !== "completed") return;
    const existing = await readTopicAssignments(
      projectId,
      facet,
      rows,
      run.id,
      timeRange,
    );
    const assigned = new Set(
      existing.map((row) =>
        JSON.stringify([row.traceId, row.summaryProcessedAt]),
      ),
    );
    const pending = rows.filter(
      (row) => !assigned.has(JSON.stringify([row.traceId, row.processedAt])),
    );
    if (!pending.length) return;
    await writeTopicAssignments(
      topicAssignments({
        projectId,
        facet,
        embeddingConfig: config,
        summaries: pending,
        run,
        origin: "online",
        assignedAt: new Date().toISOString(),
      }),
    );
  };
  let maps = await getTopicProcessingMapIds(projectId, facets, embeddingConfig);
  const withoutCompatibleMap = facets.filter(
    (facet) => !maps.some((map) => map.facetId === facet.facetId && map.runId),
  );
  const published =
    !data.updateInput && withoutCompatibleMap.length
      ? await prisma.topicClusteringRun.findMany({
          where: {
            projectId,
            status: "completed",
            OR: withoutCompatibleMap.map((facet) => ({
              facetId: facet.facetId,
              facetVersion: facet.version,
            })),
          },
          distinct: ["facetId", "facetVersion"],
          select: { facetId: true, facetVersion: true },
        })
      : [];
  if (published.length)
    maps = await getTopicProcessingMapIds(projectId, facets, embeddingConfig);
  const undiscovered = withoutCompatibleMap.filter(
    (facet) =>
      currentFacets.some(
        (current) =>
          current.facetId === facet.facetId &&
          current.version === facet.version,
      ) &&
      embeddingConfig.embeddingModel ===
        currentEmbeddingConfig.embeddingModel &&
      embeddingConfig.embeddingDimensions ===
        currentEmbeddingConfig.embeddingDimensions &&
      !published.some(
        (run) =>
          run.facetId === facet.facetId && run.facetVersion === facet.version,
      ),
  );
  if (traceIds) {
    let needsDiscovery = false;
    for (const facet of facets) {
      const rows = complete(
        await listTopicSummaries(
          projectId,
          {
            facetId: facet.facetId,
            facetVersion: facet.version,
            traceIds,
          },
          timeRange,
        ),
        facet,
        timeRange,
      );
      const runId = maps.find((map) => map.facetId === facet.facetId)?.runId;
      const run =
        runId && rows.length ? await getTopicRun(projectId, runId) : null;
      if (run) await assign(facet, run, rows);
      else if (
        rows.length &&
        undiscovered.some((missing) => missing.facetId === facet.facetId)
      )
        needsDiscovery = true;
    }
    if (needsDiscovery)
      await enqueueAutomaticTopicDiscovery(projectId, undiscovered);
    return;
  }

  let updateInput = data.updateInput;
  if (!updateInput) {
    const missing = undiscovered.filter((facet) =>
      data.payload.facets?.some(
        (requested) =>
          requested.facetId === facet.facetId &&
          requested.version === facet.version,
      ),
    );
    const counts = await getTopicSummaryCounts(
      projectId,
      missing,
      embeddingConfig,
      timeRange,
    );
    const minimumTraceCount = topicClusterSettings(false).minimumCount;
    const ready = missing.filter((facet) =>
      counts.some(
        (count) =>
          count.facetId === facet.facetId &&
          count.facetVersion === facet.version &&
          count.count >= minimumTraceCount,
      ),
    );
    if (ready.length) {
      const parsed = topicExecutionInputSchema.parse({
        projectId,
        requestId: data.id,
        operation: "update",
        facets: ready,
        embeddingConfig,
        timeRange,
        exploratory: false,
        minimumTraceCount,
      });
      if (parsed.operation !== "update")
        throw new Error("Automatic discovery requires an update.");
      updateInput = parsed;
      // Persist the frozen input before creating its idempotent execution.
      await saveUpdateInput(updateInput);
    }
  }
  const catchUp = async () => {
    maps = await getTopicProcessingMapIds(projectId, facets, embeddingConfig);
    for (const facet of facets) {
      if (
        ![...(data.payload.facets ?? []), ...(updateInput?.facets ?? [])].some(
          (requested) =>
            requested.facetId === facet.facetId &&
            requested.version === facet.version,
        )
      )
        continue;
      const runId = maps.find((map) => map.facetId === facet.facetId)?.runId;
      let run = runId ? await getTopicRun(projectId, runId) : null;
      if (!runId && !updateInput)
        run = await getPublishedTopicRun(projectId, facet.facetId);
      if (
        !run ||
        run.status !== "completed" ||
        run.projectId !== projectId ||
        run.facetId !== facet.facetId ||
        run.facetVersion !== facet.version
      )
        continue;
      // Unaccepted follow-ups catch up the serving map, even after model changes.
      const catchUpConfig = updateInput
        ? embeddingConfig
        : topicEmbeddingConfigSchema.parse({
            embeddingModel: run.config.embeddingModel,
            embeddingDimensions: run.config.dimensions,
          });
      const rows = complete(
        await getTopicClusteringSummaries(
          projectId,
          facet.facetId,
          facet.version,
          catchUpConfig,
          timeRange,
        ),
        facet,
        timeRange,
        catchUpConfig,
      );
      await assign(facet, run, rows, catchUpConfig);
    }
  };
  if (updateInput) {
    const execution = await createAutomaticTopicExecution(updateInput);
    await processTopicsExecution({
      projectId,
      executionId: execution.id,
      beforeComplete: catchUp,
    });
    const finished = await readTopicExecutionSummary(projectId, execution.id);
    if (
      !finished ||
      finished.status === "failed" ||
      finished.facets.some((facet) => facet.outcome === "failed")
    )
      throw new Error(
        finished?.error ??
          "Automatic Topics discovery failed. Resume the execution to retry.",
      );
  } else {
    // A queued discovery may find a map published while its source batch ran.
    await catchUp();
  }
}
