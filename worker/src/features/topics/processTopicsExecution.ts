import {
  getTopicsArtifactRoot,
  isTopicsEnabled,
  readTopicExecution,
  writeTopicExecution,
  readTopicArtifact,
  writeTopicArtifact,
  getTopicFacetVersion,
  listTopicSummaries,
  writeTopicSummaries,
  writeTopicAssignments,
  readTopicAssignments,
  readTopicSummaries,
  createTopicRun,
  getTopicRun,
  getPublishedTopicRun,
  getLatestFacetSummaries,
  saveTopicRun,
  loadTopicTranscript,
} from "@langfuse/shared/topics/server";
import {
  type TopicExecution,
  type TopicFacetVersion,
  type TopicSummary,
  type TopicRun,
  type TopicAssignment,
  type TopicFacetProgress,
  type TopicDefinition,
  TOPICS_SUMMARY_MODEL,
  TOPICS_EMBEDDING_MODEL,
} from "@langfuse/shared/topics";
import {
  summarizeTopicTrace,
  embedTopicSummary,
  nameTopicGroups,
  TOPICS_SUMMARY_PROMPT_VERSION,
  TOPICS_NAMING_MODEL,
} from "./models";
import {
  TopicsBudget,
  TopicsBudgetExhausted,
  TopicsUncertainCall,
} from "./budget";
import { TopicsProviderUnavailable } from "./provider-error";
import {
  buildTopicPrototypes,
  buildNamingEvidence,
  classifyTopic,
  topicHash,
} from "./classifier";
import {
  runTopicClustering,
  topicClusterSettings,
  TOPICS_NUMERIC_VERSION,
} from "./numeric";
import { matchTopicContinuity, decideTopicRefresh } from "./continuity";

const artifactKey = (kind: string, value: unknown) =>
  `${kind}-${topicHash(value).slice(0, 48)}`;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Topics processing failed.";
const isExecutionFailure = (error: unknown) =>
  error instanceof TopicsBudgetExhausted ||
  error instanceof TopicsUncertainCall ||
  error instanceof TopicsProviderUnavailable;

async function checkpoint<T>(
  execution: TopicExecution,
  key: string,
  create: () => Promise<T>,
): Promise<T> {
  const accepted = await readTopicArtifact<T>(
    execution.projectId,
    execution.id,
    key,
  );
  if (accepted !== null) return accepted;
  const value = await create();
  await writeTopicArtifact(execution.projectId, execution.id, key, value);
  return value;
}

async function saveProgress(execution: TopicExecution, phase: string) {
  execution.phase = phase;
  Object.assign(
    execution,
    await new TopicsBudget(getTopicsArtifactRoot()).totals(execution.id),
  );
  execution.estimatedCostUsd = execution.reservedCostUsd;
  await writeTopicExecution(execution);
}

const summaryInvocationHash = (inputHash: string, facet: TopicFacetVersion) =>
  topicHash({
    inputHash,
    facet,
    pipelineVersion: "1",
    summaryPromptVersion: TOPICS_SUMMARY_PROMPT_VERSION,
  });

const summaryConfigHash = (facet: TopicFacetVersion) =>
  topicHash({
    prompt: facet.prompt,
    summaryModel: facet.processingConfig.summaryModel,
    projection: facet.processingConfig.projection,
    maxInputTokens: facet.processingConfig.maxInputTokens,
    maxOutputTokens: facet.processingConfig.maxOutputTokens,
    assemblerVersion: facet.processingConfig.assemblerVersion,
  });

async function loadCachedSummaries(
  projectId: string,
  facet: TopicFacetVersion,
  traceIds: string[],
): Promise<TopicSummary[]> {
  const rows = await listTopicSummaries(projectId, {
    facetId: facet.facetId,
    traceIds,
  });
  const versions = new Map<string, TopicFacetVersion | null>([
    [facet.id, facet],
  ]);
  const configHash = summaryConfigHash(facet);
  const compatible: TopicSummary[] = [];
  for (const row of rows) {
    if (
      row.facetId !== facet.facetId ||
      row.summaryModel !== TOPICS_SUMMARY_MODEL
    )
      continue;
    if (!versions.has(row.facetVersionId))
      versions.set(
        row.facetVersionId,
        await getTopicFacetVersion(projectId, row.facetVersionId),
      );
    const source = versions.get(row.facetVersionId);
    // Verify the original invocation so older prompt outputs cannot masquerade
    // as reusable summaries merely because their facet settings match.
    if (
      source &&
      source.facetId === facet.facetId &&
      summaryConfigHash(source) === configHash &&
      row.invocationHash === summaryInvocationHash(row.inputHash, source)
    )
      compatible.push(row);
  }
  return compatible;
}

async function summarizeTrace(
  execution: TopicExecution,
  facet: TopicFacetVersion,
  traceId: string,
  cached: TopicSummary[],
  getTranscript: () => ReturnType<typeof loadTopicTranscript>,
): Promise<TopicSummary> {
  const summaryKey = artifactKey("summary", [traceId, facet.id]);
  const summary = await checkpoint<TopicSummary>(
    execution,
    summaryKey,
    async () => {
      const { traceTimestamp, snapshotHash, transcript } =
        await getTranscript();
      const invocationHash = summaryInvocationHash(transcript.inputHash, facet);
      const candidates = cached.filter(
        (row) =>
          row.traceId === traceId && row.inputHash === transcript.inputHash,
      );
      const embeddingMatches = (row: TopicSummary) =>
        row.state === "complete" &&
        row.embeddingModel === TOPICS_EMBEDDING_MODEL &&
        row.embedding.length ===
          execution.input.embeddingConfig.embeddingDimensions;
      const reusable =
        candidates.find(
          (row) =>
            row.facetVersionId === facet.id &&
            (row.state !== "complete" || embeddingMatches(row)),
        ) ??
        candidates.find(embeddingMatches) ??
        candidates[0];
      const base = {
        id: topicHash([execution.id, traceId, facet.id, invocationHash]).slice(
          0,
          48,
        ),
        projectId: execution.projectId,
        facetId: facet.facetId,
        facetVersionId: facet.id,
        facetVersion: facet.version,
        traceId,
        unitType: "trace" as const,
        triggerType: "manual_poc" as const,
        traceTimestamp,
        revision: execution.revision,
        executionId: execution.id,
        inputHash: transcript.inputHash,
        snapshotHash,
        invocationHash,
        summaryModel: TOPICS_SUMMARY_MODEL,
        embeddingModel: TOPICS_EMBEDDING_MODEL,
        processedAt: new Date().toISOString(),
        metadata: {
          transcriptVersion: transcript.transcriptVersion,
          coverage: transcript.coverage,
          sourceReferences: transcript.sourceReferences,
        },
      };
      if (reusable) {
        const superseded = cached.some(
          (row) =>
            row.traceId === traceId &&
            row.facetVersionId === facet.id &&
            row.inputHash !== reusable.inputHash &&
            BigInt(row.revision) > BigInt(reusable.revision),
        );
        if (
          !superseded &&
          reusable.facetVersionId === facet.id &&
          (reusable.state !== "complete" || embeddingMatches(reusable))
        )
          return reusable;
        const reuseEmbedding = embeddingMatches(reusable);
        const state =
          reusable.state === "complete" && !reuseEmbedding
            ? "summarized"
            : reusable.state;
        return {
          ...base,
          state,
          resultVersion: state === "summarized" ? 1 : 2,
          summary: reusable.summary,
          embedding: reuseEmbedding ? reusable.embedding : [],
          inputTokens: 0,
          outputTokens: 0,
          embeddingTokens: 0,
          summaryCostUsd: 0,
          embeddingCostUsd: 0,
          metadata: {
            ...base.metadata,
            evidenceBlockIds: reusable.metadata.evidenceBlockIds ?? [],
            summaryReusedFromId: reusable.id,
            ...(reuseEmbedding ? { embeddingReusedFromId: reusable.id } : {}),
          },
        };
      }
      if (
        !transcript.sourceReferences.some(
          (reference) => reference.source !== "structure",
        )
      )
        return {
          ...base,
          resultVersion: 2,
          state: "insufficient_input",
          summary: "",
          embedding: [],
          inputTokens: 0,
          outputTokens: 0,
          embeddingTokens: 0,
          summaryCostUsd: 0,
          embeddingCostUsd: 0,
        };
      const result = await summarizeTopicTrace(
        { execution, key: invocationHash },
        facet,
        transcript.text,
        transcript.sourceReferences.map((reference) => reference.blockId),
      );
      const evidence = new Set(
        transcript.sourceReferences.map((reference) => reference.blockId),
      );
      if (result.output.evidenceBlockIds.some((id) => !evidence.has(id)))
        throw new Error(
          "Facet summary cited a block absent from the trace transcript.",
        );
      const applicable = result.output.status === "applicable";
      if (
        applicable &&
        (!result.output.summary.trim() ||
          !result.output.evidenceBlockIds.length ||
          result.output.summary.length > 2000)
      )
        throw new Error(
          "Applicable facet summary lacks concise supported evidence.",
        );
      if (
        !applicable &&
        (result.output.summary.trim() || result.output.evidenceBlockIds.length)
      )
        throw new Error(
          "Non-applicable facet result contains a summary or evidence.",
        );
      return {
        ...base,
        resultVersion: applicable ? 1 : 2,
        state:
          result.output.status === "applicable"
            ? "summarized"
            : result.output.status,
        summary: result.output.summary.trim(),
        embedding: [],
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        embeddingTokens: 0,
        summaryCostUsd: result.costUsd,
        embeddingCostUsd: 0,
        metadata: {
          ...base.metadata,
          evidenceBlockIds: result.output.evidenceBlockIds,
        },
      };
    },
  );
  return ensureEmbedding(execution, summary);
}

/** Re-embedding stored summaries never reloads traces or repeats summarization. */
async function ensureEmbedding(
  execution: TopicExecution,
  source: TopicSummary,
): Promise<TopicSummary> {
  const { embeddingModel, embeddingDimensions } =
    execution.input.embeddingConfig;
  if (
    source.state === "not_applicable" ||
    source.state === "insufficient_input" ||
    (source.state === "complete" &&
      source.embeddingModel === embeddingModel &&
      source.embedding.length === embeddingDimensions)
  ) {
    await writeTopicSummaries([source]);
    return source;
  }
  const summary: TopicSummary =
    source.state === "summarized" && source.executionId === execution.id
      ? source
      : {
          ...source,
          id: topicHash([
            execution.id,
            source.id,
            execution.input.embeddingConfig,
          ]).slice(0, 48),
          revision: execution.revision,
          executionId: execution.id,
          state: "summarized",
          resultVersion: 1,
          embedding: [],
          embeddingModel,
          inputTokens: 0,
          outputTokens: 0,
          summaryCostUsd: 0,
          embeddingTokens: 0,
          embeddingCostUsd: 0,
          processedAt: new Date().toISOString(),
          metadata: { ...source.metadata, summaryReusedFromId: source.id },
        };
  await writeTopicSummaries([summary]);
  const complete = await checkpoint<TopicSummary>(
    execution,
    artifactKey("complete", [summary.id, execution.input.embeddingConfig]),
    async () => {
      const embedded = await embedTopicSummary(
        {
          execution,
          key: topicHash([
            summary.invocationHash,
            summary.summary,
            execution.input.embeddingConfig,
          ]),
        },
        summary.summary,
        embeddingDimensions,
      );
      return {
        ...summary,
        state: "complete",
        resultVersion: 2,
        embedding: embedded.embedding,
        embeddingTokens: embedded.inputTokens,
        embeddingCostUsd: embedded.costUsd,
      };
    },
  );
  await writeTopicSummaries([complete]);
  return complete;
}

function countSummaries(
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
) {
  progress.summaryIds = summaries.map((row) => row.id);
  progress.counts.complete = summaries.filter(
    (row) => row.state === "complete",
  ).length;
  progress.counts.nonApplicable = summaries.filter(
    (row) => row.state === "not_applicable",
  ).length;
  progress.counts.insufficientInput = summaries.filter(
    (row) => row.state === "insufficient_input",
  ).length;
}

function assignmentRows(
  execution: TopicExecution,
  facet: TopicFacetVersion,
  summaries: TopicSummary[],
  run: TopicRun,
): TopicAssignment[] {
  const prototypes = run.topics.map((topic) => ({
    id: topic.topicVersionId,
    centroid: topic.centroid,
    radius: topic.radius,
  }));
  const time = new Date().toISOString();
  return summaries.map((summary) => {
    const assigned = classifyTopic(summary.embedding, prototypes);
    const topic = run.topics.find(
      (candidate) => candidate.topicVersionId === assigned.topicId,
    );
    return {
      id: topicHash([execution.id, run.id, summary.id]).slice(0, 48),
      projectId: execution.projectId,
      facetId: facet.facetId,
      facetVersionId: facet.id,
      facetVersion: facet.version,
      unitType: "trace",
      traceId: summary.traceId,
      traceTimestamp: summary.traceTimestamp,
      summaryId: summary.id,
      summaryRevision: summary.revision,
      runId: run.id,
      runSequence: run.runSequence,
      topicId: topic?.topicId ?? null,
      topicVersionId: topic?.topicVersionId ?? null,
      outcome: topic ? "assigned" : "outlier",
      distance: assigned.distance,
      runnerUpDistance: assigned.runnerUpDistance,
      rejectionReason: assigned.rejectionReason,
      origin: execution.input.operation === "assign" ? "online" : "initial",
      assignedAt: time,
    };
  });
}

async function assignSummaries(
  execution: TopicExecution,
  facet: TopicFacetVersion,
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
  run: TopicRun,
) {
  if (
    run.projectId !== execution.projectId ||
    run.facetVersionId !== facet.id ||
    run.topics.some(
      (topic) =>
        topic.centroid.length !==
        execution.input.embeddingConfig.embeddingDimensions,
    ) ||
    (run.config.embeddingModel &&
      run.config.embeddingModel !==
        execution.input.embeddingConfig.embeddingModel)
  )
    throw new Error("Target map is incompatible with this facet version.");
  const rows = await checkpoint(
    execution,
    artifactKey("assignments", run.id),
    async () => {
      const existing = summaries.length
        ? await readTopicAssignments(
            execution.projectId,
            summaries.map((summary) => summary.id),
            run.id,
          )
        : [];
      const byId = new Map(existing.map((row) => [row.id, row]));
      return assignmentRows(execution, facet, summaries, run).map(
        (row) => byId.get(row.id) ?? row,
      );
    },
  );
  await writeTopicAssignments(rows);
  const visible = rows.length
    ? await readTopicAssignments(
        execution.projectId,
        summaries.map((summary) => summary.id),
        run.id,
      )
    : [];
  const visibleBySummary = new Map(visible.map((row) => [row.summaryId, row]));
  // A retry can read a later equivalent assignment to the same immutable map.
  if (
    rows.some((row) => {
      const persisted = visibleBySummary.get(row.summaryId);
      return (
        !persisted ||
        persisted.topicId !== row.topicId ||
        persisted.topicVersionId !== row.topicVersionId ||
        persisted.outcome !== row.outcome
      );
    })
  )
    throw new Error(
      "Topic assignments are not fully visible; map publication is deferred.",
    );
  progress.counts.assigned = rows.filter(
    (row) => row.outcome === "assigned",
  ).length;
  progress.counts.outlier = rows.length - progress.counts.assigned;
}

async function discover(
  execution: TopicExecution,
  facet: TopicFacetVersion,
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
  previous: TopicRun | null = null,
) {
  if (!summaries.length) {
    progress.outcome = "no_applicable_summaries";
    return;
  }
  const numericConfig = {
    ...topicClusterSettings(execution.input.exploratory),
    numericVersion: TOPICS_NUMERIC_VERSION,
  };
  if (summaries.length < numericConfig.minimumCount) {
    progress.outcome = "insufficient_data";
    return;
  }
  const manifest = await checkpoint(
    execution,
    artifactKey("manifest", facet.id),
    async () =>
      [...summaries]
        .sort((a, b) =>
          a.traceId < b.traceId
            ? -1
            : a.traceId > b.traceId
              ? 1
              : a.id < b.id
                ? -1
                : a.id > b.id
                  ? 1
                  : 0,
        )
        .map((row) => ({
          id: row.id,
          revision: row.revision,
          inputHash: row.inputHash,
        })),
  );
  const summariesById = new Map(summaries.map((row) => [row.id, row]));
  if (
    manifest.length !== summaries.length ||
    new Set(manifest.map((row) => row.id)).size !== summaries.length ||
    manifest.some((row) => {
      const summary = summariesById.get(row.id);
      return (
        !summary ||
        summary.revision !== row.revision ||
        summary.inputHash !== row.inputHash
      );
    })
  )
    throw new Error("Discovery manifest changed during replay.");
  // The accepted manifest also preserves the order used by saved numeric results.
  summaries = manifest.map((row) => summariesById.get(row.id)!);
  let run = await createTopicRun({
    id: topicHash([execution.id, facet.id, "run"]).slice(0, 48),
    projectId: execution.projectId,
    facetVersionId: facet.id,
    summaryIds: summaries.map((row) => row.id),
    config: {
      ...numericConfig,
      exploratory: execution.input.exploratory,
      embeddingModel: TOPICS_EMBEDDING_MODEL,
      dimensions: execution.input.embeddingConfig.embeddingDimensions,
      classifierVersion: "original-cosine-loo95-rival05-eps1e-12-v2",
      executionId: execution.id,
      previousRunId: previous?.id ?? null,
      refresh: progress.refresh ?? null,
    },
  });
  progress.runId = run.id;
  if (run.publishedAt) {
    await assignSummaries(execution, facet, progress, summaries, run);
    progress.outcome = "published";
    return;
  }
  run = await saveTopicRun({
    ...run,
    status: "running",
    phase: "clustering",
    startedAt: run.startedAt ?? new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
  await saveProgress(execution, "clustering");
  try {
    const numeric = await checkpoint(
      execution,
      artifactKey("numeric", run.id),
      async () => {
        // An accepted fit retains its original provenance. A pending fit uses
        // the installed backend, including when a run resumes after an upgrade.
        run = await saveTopicRun({
          ...run,
          config: {
            ...run.config,
            ...numericConfig,
          },
        });
        return runTopicClustering(
          summaries.map((row) => row.embedding),
          execution.input.exploratory,
        );
      },
    );
    if (numeric.status !== "complete") {
      if (numeric.status === "no_topics") {
        await assignSummaries(execution, facet, progress, summaries, run);
      }
      await saveTopicRun({
        ...run,
        status: "completed",
        phase: numeric.status,
        publishedAt:
          numeric.status === "no_topics" ? new Date().toISOString() : null,
        finishedAt: new Date().toISOString(),
        metrics: { applicable: summaries.length, densityClusters: 0 },
      });
      progress.outcome =
        numeric.status === "insufficient_data"
          ? "insufficient_data"
          : "no_topics";
      return;
    }
    const densityPrototypes = buildTopicPrototypes(summaries, numeric.labels);
    const densityIds = new Map(
      densityPrototypes.map((prototype) => [
        prototype.id,
        topicHash([run.id, prototype.id]).slice(0, 48),
      ]),
    );
    let prototypes = densityPrototypes.map((prototype) => ({
      ...prototype,
      id: densityIds.get(prototype.id)!,
    }));
    // A density cluster can have no population under the serving classifier.
    for (;;) {
      const active = new Set(
        summaries.map(
          (row) => classifyTopic(row.embedding, prototypes).topicId,
        ),
      );
      const retained = prototypes.filter((prototype) =>
        active.has(prototype.id),
      );
      if (retained.length === prototypes.length) break;
      prototypes = retained;
    }
    if (!prototypes.length) {
      await assignSummaries(execution, facet, progress, summaries, run);
      await saveTopicRun({
        ...run,
        status: "completed",
        phase: "no_topics",
        publishedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        metrics: { applicable: summaries.length },
      });
      progress.outcome = "no_topics";
      return;
    }
    const evidence = buildNamingEvidence(summaries, prototypes);
    await writeTopicArtifact(
      execution.projectId,
      execution.id,
      artifactKey("evidence", run.id),
      evidence,
    );
    await saveProgress(execution, "naming");
    let topics: TopicDefinition[] = [];
    const names = new Set<string>();
    for (const group of evidence) {
      const result = await nameTopicGroups(
        { execution, key: topicHash([run.id, group]) },
        { groups: [group] },
      );
      if (
        result.output.labels.length !== 1 ||
        result.output.labels[0].id !== group.id
      )
        throw new Error("Naming did not return exactly the requested group.");
      const label = result.output.labels[0];
      if (
        !label.name.trim() ||
        label.name.length > 100 ||
        !label.description.trim() ||
        label.description.length > 600 ||
        names.has(label.name.trim().toLowerCase())
      )
        throw new Error(
          "Topic names must be concise, non-empty, and distinct.",
        );
      const members = new Set(group.members.map((member) => member.id));
      if (
        !label.evidenceSummaryIds.length ||
        label.evidenceSummaryIds.length > 3 ||
        label.evidenceSummaryIds.some((id) => !members.has(id))
      )
        throw new Error("Topic name cited missing or contrastive evidence.");
      names.add(label.name.trim().toLowerCase());
      const prototype = prototypes.find(
        (candidate) => candidate.id === group.id,
      )!;
      const id = prototype.id;
      topics.push({
        topicVersionId: id,
        projectId: execution.projectId,
        topicId: id,
        runId: run.id,
        name: label.name.trim(),
        description: label.description.trim(),
        centroid: prototype.centroid,
        radius: prototype.radius,
        representativeSummaryIds: label.evidenceSummaryIds,
        metadata: {
          effectiveMemberCount: group.count,
          discoveryLabel: prototype.id,
          seedSummaryIds: prototype.seedSummaryIds,
          namingModel: TOPICS_NAMING_MODEL,
          namingEvidence: group,
        },
      });
    }
    if (previous) {
      topics = await checkpoint(
        execution,
        artifactKey("continuity", run.id),
        async () => {
          const previousSummaries = await readTopicSummaries(
            execution.projectId,
            previous.summaryIds,
          );
          const previousAssignments = await readTopicAssignments(
            execution.projectId,
            previous.summaryIds,
            previous.id,
          );
          const bySummary = new Map(
            previousSummaries.map((row) => [row.id, row]),
          );
          const candidateBySummary = new Map(
            summaries.map((row) => [row.id, row]),
          );
          return matchTopicContinuity({
            previousTopics: previous.topics,
            candidateTopics: topics,
            previousMemberships: previousAssignments.flatMap((row) => {
              const summary = bySummary.get(row.summaryId);
              return summary
                ? [
                    {
                      traceId: summary.traceId,
                      inputHash: summary.inputHash,
                      topicVersionId: row.topicVersionId,
                    },
                  ]
                : [];
            }),
            candidateMemberships: assignmentRows(execution, facet, summaries, {
              ...run,
              topics,
            }).map((row) => ({
              traceId: row.traceId,
              inputHash: candidateBySummary.get(row.summaryId)!.inputHash,
              topicVersionId: row.topicVersionId,
            })),
            exploratory: execution.input.exploratory,
            compatibleEmbeddingSpace: compatibleMap(execution, facet, previous),
          });
        },
      );
    }
    const activeIds = new Set(prototypes.map((prototype) => prototype.id));
    const mismatch = summaries.filter((row, index) => {
      const densityId = densityIds.get(`cluster_${numeric.labels[index]}`);
      return (
        classifyTopic(row.embedding, prototypes).topicId !==
        (densityId && activeIds.has(densityId) ? densityId : null)
      );
    }).length;
    run = await saveTopicRun({
      ...run,
      topics,
      phase: "assigning",
      artifactPath: artifactKey("numeric", run.id),
      metrics: {
        applicable: summaries.length,
        densityClusters: new Set(numeric.labels.filter((label) => label >= 0))
          .size,
        effectiveTopics: topics.length,
        discoveryClassifierMismatch: mismatch,
        densityNoise: numeric.labels.filter((label) => label < 0).length,
      },
    });
    // Readback returns the persisted classifier precision before creating any memberships.
    await assignSummaries(execution, facet, progress, summaries, run);
    run = await saveTopicRun({
      ...run,
      status: "completed",
      phase: "published",
      publishedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      metrics: {
        ...run.metrics,
        assigned: progress.counts.assigned,
        outlier: progress.counts.outlier,
      },
    });
    progress.outcome = "published";
  } catch (error) {
    await saveTopicRun({
      ...run,
      status: "failed",
      phase: "failed",
      error: errorMessage(error),
      finishedAt: new Date().toISOString(),
    });
    throw error;
  }
}

function compatibleMap(
  execution: TopicExecution,
  facet: TopicFacetVersion,
  run: TopicRun,
): boolean {
  return (
    run.facetVersionId === facet.id &&
    run.config.embeddingModel ===
      execution.input.embeddingConfig.embeddingModel &&
    run.config.dimensions ===
      execution.input.embeddingConfig.embeddingDimensions
  );
}

async function clearNonApplicable(
  execution: TopicExecution,
  facet: TopicFacetVersion,
  summaries: TopicSummary[],
) {
  const rows = await checkpoint<TopicAssignment[]>(
    execution,
    artifactKey("no-topic", facet.id),
    async () =>
      summaries.flatMap((summary) => {
        if (
          summary.state !== "not_applicable" &&
          summary.state !== "insufficient_input"
        )
          return [];
        return [
          {
            id: topicHash([execution.id, summary.id, "no-topic"]).slice(0, 48),
            projectId: execution.projectId,
            facetId: facet.facetId,
            facetVersionId: facet.id,
            facetVersion: facet.version,
            unitType: "trace" as const,
            traceId: summary.traceId,
            traceTimestamp: summary.traceTimestamp,
            summaryId: summary.id,
            summaryRevision: summary.revision,
            runId: null,
            runSequence: null,
            topicId: null,
            topicVersionId: null,
            outcome: summary.state,
            distance: null,
            runnerUpDistance: null,
            rejectionReason: summary.state,
            origin: "online" as const,
            assignedAt: new Date().toISOString(),
          },
        ];
      }),
  );
  if (rows.length) await writeTopicAssignments(rows);
}

async function refreshFacet(
  execution: TopicExecution,
  facet: TopicFacetVersion,
  progress: TopicFacetProgress,
  selected: TopicSummary[],
) {
  const frozen = await checkpoint(
    execution,
    artifactKey("refresh-cohort", facet.id),
    async () => {
      const previous = await getPublishedTopicRun(
        execution.projectId,
        facet.facetId,
      );
      const latest = await getLatestFacetSummaries(
        execution.projectId,
        facet.facetId,
        facet.id,
      );
      const byTrace = new Map(latest.map((row) => [row.traceId, row]));
      for (const row of selected) byTrace.set(row.traceId, row);
      return {
        previous: previous?.facetVersionId === facet.id ? previous : null,
        summaryIds: [...byTrace.values()].map((row) => row.id),
      };
    },
  );
  const stored = await readTopicSummaries(
    execution.projectId,
    frozen.summaryIds,
  );
  if (stored.length !== frozen.summaryIds.length)
    throw new Error("Refresh cohort is not fully visible.");
  const summaries: TopicSummary[] = [];
  for (const row of stored)
    summaries.push(await ensureEmbedding(execution, row));
  countSummaries(progress, summaries);
  progress.counts.requested = summaries.length;
  const complete = summaries.filter((row) => row.state === "complete");
  const previous = frozen.previous;
  const previousSummaries = previous
    ? await readTopicSummaries(execution.projectId, previous.summaryIds)
    : [];
  const compatible = previous
    ? compatibleMap(execution, facet, previous)
    : false;
  progress.refresh = await checkpoint(
    execution,
    artifactKey("refresh-decision", facet.id),
    async () =>
      decideTopicRefresh({
        previousTopics: previous?.topics ?? null,
        previousSummaries,
        summaries: complete,
        exploratory: execution.input.exploratory,
        compatibleEmbeddingSpace: compatible,
        forceRefresh: execution.input.forceRefresh,
      }),
  );
  if (previous && compatible) {
    progress.runId = previous.id;
    await assignSummaries(execution, facet, progress, complete, previous);
  }
  if (progress.refresh.shouldRefresh) {
    await discover(execution, facet, progress, complete, previous);
  } else {
    progress.outcome = "assigned";
  }
}

async function reusableSummaries(
  execution: TopicExecution,
  facet: TopicFacetVersion,
): Promise<TopicSummary[]> {
  if (execution.input.operation !== "recluster") return [];
  const ids = new Set<string>();
  for (const id of execution.input.sourceExecutionIds) {
    const source = await readTopicExecution(execution.projectId, id);
    if (!source)
      throw new Error("Source execution is absent from this project.");
    const progress = source.facets.find(
      (item) => item.facetVersionId === facet.id,
    );
    if (!progress)
      throw new Error(
        "Source execution does not use the selected facet version.",
      );
    progress.summaryIds.forEach((summaryId) => ids.add(summaryId));
  }
  if (!ids.size) return [];
  const rows = await listTopicSummaries(execution.projectId, {
    ids: [...ids],
    facetVersionId: facet.id,
  });
  if (rows.length !== ids.size)
    throw new Error("Source execution summaries are not fully visible.");
  const selected = new Map<string, TopicSummary>();
  for (const row of rows) {
    const previous = selected.get(row.traceId);
    if (!previous || BigInt(row.revision) > BigInt(previous.revision))
      selected.set(row.traceId, row);
  }
  return [...selected.values()];
}

/** One local queue owner advances a frozen execution through durable checkpoints. */
export async function processTopicsExecution({
  projectId,
  executionId,
}: {
  projectId: string;
  executionId: string;
}): Promise<void> {
  if (!isTopicsEnabled())
    throw new Error("Topics PoC runs only in local development.");
  const execution = await readTopicExecution(projectId, executionId);
  if (!execution) throw new Error("Topics execution not found.");
  if (
    ["completed", "completed_with_errors"].includes(execution.status) &&
    !execution.facets.some(
      (facet) => facet.outcome === "pending" || facet.outcome === "failed",
    )
  )
    return;
  execution.status = "running";
  execution.error = null;
  await saveProgress(execution, "summarizing");
  try {
    const facets: {
      facet: TopicFacetVersion;
      progress: TopicFacetProgress;
      summaries: TopicSummary[];
      cached: TopicSummary[] | null;
    }[] = [];
    for (const progress of execution.facets) {
      if (progress.outcome !== "pending" && progress.outcome !== "failed")
        continue;
      const facet = await getTopicFacetVersion(
        projectId,
        progress.facetVersionId,
      );
      if (!facet) throw new Error("Facet version not found in this project.");
      progress.error = null;
      progress.counts.failed = 0;
      try {
        let summaries: TopicSummary[];
        let cached: TopicSummary[] | null = null;
        const cohortKey = artifactKey("cohort", facet.id);
        const cohort = await readTopicArtifact<{
          summaryIds: string[];
          failedCount: number;
        }>(projectId, execution.id, cohortKey);
        if (cohort) {
          summaries = cohort.summaryIds.length
            ? await readTopicSummaries(projectId, cohort.summaryIds)
            : [];
          const byId = new Map(summaries.map((row) => [row.id, row]));
          if (cohort.summaryIds.some((id) => !byId.has(id)))
            throw new Error(
              "The accepted summary cohort is not fully visible.",
            );
          summaries = cohort.summaryIds.map((id) => byId.get(id)!);
          progress.counts.failed = cohort.failedCount;
          if (execution.input.operation === "recluster")
            progress.counts.requested = summaries.length;
        } else if (execution.input.operation === "recluster") {
          summaries = [];
          for (const row of await reusableSummaries(execution, facet))
            summaries.push(await ensureEmbedding(execution, row));
          progress.counts.requested = summaries.length;
        } else {
          summaries = [];
          cached = await loadCachedSummaries(
            projectId,
            facet,
            execution.input.traceIds,
          );
        }
        facets.push({ facet, progress, summaries, cached });
      } catch (error) {
        progress.outcome = "failed";
        progress.error = errorMessage(error);
        if (isExecutionFailure(error)) throw error;
        await saveProgress(execution, "summarizing");
      }
    }

    if (execution.input.operation !== "recluster") {
      const extracting = facets.filter((item) => item.cached !== null);
      for (const traceId of execution.input.traceIds) {
        // Scope the promise to one trace, including a rejected source read.
        // Accepted summary checkpoints never invoke the loader.
        let input: ReturnType<typeof loadTopicTranscript> | undefined;
        const getTranscript = () => {
          if (input) return input;
          input = (async () => {
            const accepted = await Promise.all(
              execution.facets.map((progress) =>
                readTopicArtifact<TopicSummary>(
                  projectId,
                  execution.id,
                  artifactKey("summary", [traceId, progress.facetVersionId]),
                ),
              ),
            );
            const loaded = await loadTopicTranscript({ projectId, traceId });
            if (
              accepted.some(
                (summary) =>
                  summary && summary.inputHash !== loaded.transcript.inputHash,
              )
            )
              throw new Error(
                "Trace input changed since an accepted facet summary. Start a new execution to process the updated trace.",
              );
            return loaded;
          })();
          return input;
        };
        for (const { facet, progress, summaries, cached } of extracting) {
          try {
            summaries.push(
              await summarizeTrace(
                execution,
                facet,
                traceId,
                cached!,
                getTranscript,
              ),
            );
          } catch (error) {
            if (isExecutionFailure(error)) {
              progress.outcome = "failed";
              progress.error = errorMessage(error);
              throw error;
            }
            progress.counts.failed++;
            const message = errorMessage(error);
            if (
              !execution.traceErrors.some(
                (item) => item.traceId === traceId && item.error === message,
              )
            )
              execution.traceErrors.push({ traceId, error: message });
          }
          countSummaries(progress, summaries);
          await saveProgress(execution, "summarizing");
        }
      }
    }

    for (const { facet, progress, summaries } of facets) {
      try {
        countSummaries(progress, summaries);
        const visible = summaries.length
          ? await readTopicSummaries(
              projectId,
              summaries.map((summary) => summary.id),
            )
          : [];
        const visibleIds = new Set(
          visible
            .filter((summary) => summary.state !== "summarized")
            .map((summary) => summary.id),
        );
        if (summaries.some((summary) => !visibleIds.has(summary.id)))
          throw new Error(
            "Topic summaries are not fully visible; processing is deferred.",
          );
        // Downstream retries keep the same population even if failed source reads recover.
        await checkpoint(
          execution,
          artifactKey("cohort", facet.id),
          async () => ({
            summaryIds: summaries.map((summary) => summary.id),
            failedCount: progress.counts.failed,
          }),
        );
        await clearNonApplicable(execution, facet, summaries);
        const complete = summaries.filter((row) => row.state === "complete");
        if (execution.input.operation === "refresh") {
          await refreshFacet(execution, facet, progress, summaries);
        } else if (execution.input.operation === "assign") {
          const run = await getTopicRun(
            projectId,
            execution.input.targetRunIds[facet.id],
          );
          if (!run?.publishedAt)
            throw new Error("Select a published target map.");
          progress.runId = run.id;
          await assignSummaries(execution, facet, progress, complete, run);
          progress.outcome = "assigned";
        } else {
          const baseline = await checkpoint(
            execution,
            artifactKey("baseline", facet.id),
            async () => ({
              run: await getPublishedTopicRun(projectId, facet.facetId),
            }),
          );
          await discover(
            execution,
            facet,
            progress,
            complete,
            baseline.run?.facetVersionId === facet.id ? baseline.run : null,
          );
        }
      } catch (error) {
        progress.outcome = "failed";
        progress.error = errorMessage(error);
        if (isExecutionFailure(error)) throw error;
      }
      await saveProgress(execution, "processing");
    }
    execution.status = execution.facets.some(
      (facet) => facet.outcome === "failed" || facet.counts.failed > 0,
    )
      ? "completed_with_errors"
      : "completed";
    await saveProgress(execution, "completed");
  } catch (error) {
    execution.status =
      error instanceof TopicsBudgetExhausted ? "budget_exhausted" : "failed";
    execution.error = errorMessage(error);
    await saveProgress(execution, execution.status);
  }
}
