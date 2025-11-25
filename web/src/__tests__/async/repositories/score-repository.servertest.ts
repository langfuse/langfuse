import { prisma } from "@langfuse/shared/src/db";
import {
  createScoresCh,
  getScoreById,
  getScoresGroupedByNameSourceType,
  getScoresUiTable,
  getScoresForTraces,
  getScoresForObservations,
  getScoresForSessions,
  createTracesCh,
  createObservationsCh,
  createTrace,
  createObservation,
  createTraceScore,
  createDatasetRunItem,
  createDatasetRunItemsCh,
  createDatasetRunScore,
  createSessionScore,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

describe("Clickhouse Scores Repository Test", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
  it("should return null if no scores are found", async () => {
    const result = await getScoreById({
      projectId,
      scoreId: v4(),
    });
    expect(result).toBeUndefined();
  });

  it("should return a score if it exists", async () => {
    const scoreId = v4();

    const score = createTraceScore({
      id: scoreId,
      project_id: projectId,
      trace_id: v4(),
      name: "Test Score",
      timestamp: Date.now(),
      value: 100,
      source: "API",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
      environment: "default",
    });

    await createScoresCh([score]);

    const result = await getScoreById({
      projectId,
      scoreId,
    });
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    expect(result.id).toEqual(score.id);
    expect(result.projectId).toEqual(score.project_id);
    expect(result.name).toEqual(score.name);
    expect(result.value).toEqual(score.value);
    expect(result.source).toEqual(score.source);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  describe("getScoresGroupedByNameSourceType", () => {
    it("should return empty array when no scores exist", async () => {
      const emptyProjectId = v4();
      const result = await getScoresGroupedByNameSourceType({
        projectId: emptyProjectId,
        filter: [],
      });

      expect(result).toEqual([]);
    });

    it("should return grouped dataset run item scores by dataset run ids", async () => {
      const traceId = v4();

      // Create dataset
      const dataset = await prisma.dataset.create({
        data: {
          projectId,
          name: v4(),
          description: v4(),
        },
      });

      // Create dataset run
      const datasetRun = await prisma.datasetRuns.create({
        data: {
          projectId,
          name: v4(),
          datasetId: dataset.id,
        },
      });

      // Create dataset run item
      const datasetRunItem = createDatasetRunItem({
        project_id: projectId,
        dataset_run_id: datasetRun.id,
        dataset_id: dataset.id,
        dataset_run_name: datasetRun.name,
        dataset_item_id: v4(),
        trace_id: traceId,
      });
      await createDatasetRunItemsCh([datasetRunItem]);

      // Create trace
      const trace = createTrace({ id: traceId, project_id: projectId });
      await createTracesCh([trace]);

      const scoreForRunItem = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        name: "project_score",
        source: "API",
        data_type: "NUMERIC",
      });

      const scoreWithoutRun = createTraceScore({
        project_id: projectId,
        trace_id: v4(),
        name: "other_project_score",
        source: "API",
        data_type: "NUMERIC",
      });

      await createScoresCh([scoreForRunItem, scoreWithoutRun]);

      const result = await getScoresGroupedByNameSourceType({
        projectId,
        filter: [
          {
            column: "datasetRunItemRunIds",
            operator: "any of",
            value: [datasetRun.id],
            type: "stringOptions",
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "project_score",
        source: "API",
        dataType: "NUMERIC",
      });
    });

    it("should return grouped dataset run scores by dataset id", async () => {
      // Create dataset
      const dataset = await prisma.dataset.create({
        data: {
          projectId,
          name: v4(),
          description: v4(),
        },
      });

      // Create dataset run
      const datasetRun = await prisma.datasetRuns.create({
        data: {
          projectId,
          name: v4(),
          datasetId: dataset.id,
        },
      });

      // Create dataset run score
      const datasetRunScore = createDatasetRunScore({
        project_id: projectId,
        dataset_run_id: datasetRun.id,
        name: "dataset_run_score",
        source: "API",
        data_type: "NUMERIC",
      });

      const traceScore = createTraceScore({
        project_id: projectId,
        trace_id: v4(),
        name: "trace_score",
        source: "API",
        data_type: "NUMERIC",
      });
      await createScoresCh([datasetRunScore, traceScore]);

      const result = await getScoresGroupedByNameSourceType({
        projectId,
        filter: [
          {
            column: "datasetRunIds",
            operator: "any of",
            value: [datasetRun.id],
            type: "stringOptions",
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "dataset_run_score",
        source: "API",
        dataType: "NUMERIC",
      });
    });

    it("should return grouped trace scores by trace filters", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const traceId1 = v4();
      const traceId2 = v4();
      const sessionId = v4();

      // Create traces
      const trace1 = createTrace({
        id: traceId1,
        project_id: isolatedProjectId,
      });
      const trace2 = createTrace({
        id: traceId2,
        project_id: isolatedProjectId,
      });
      await createTracesCh([trace1, trace2]);

      // Create trace scores and other types
      const traceScore = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId1,
        observation_id: null, // Trace-level score
        name: "trace_accuracy",
        source: "API",
        data_type: "NUMERIC",
      });

      const sessionScore = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: null,
        session_id: sessionId,
        name: "session_quality",
        source: "ANNOTATION",
        data_type: "CATEGORICAL",
      });

      await createScoresCh([traceScore, sessionScore]);

      // Filter for trace-level scores only
      const result = await getScoresGroupedByNameSourceType({
        projectId: isolatedProjectId,
        filter: [
          {
            column: "traceId",
            operator: "is not null",
            value: "",
            type: "null",
          },
          {
            column: "observationId",
            operator: "is null",
            value: "",
            type: "null",
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "trace_accuracy",
        source: "API",
        dataType: "NUMERIC",
      });
    });

    it("should return grouped session scores by session filters", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const traceId = v4();
      const sessionId = v4();

      // Create trace
      const trace = createTrace({ id: traceId, project_id: isolatedProjectId });
      await createTracesCh([trace]);

      // Create session scores and trace scores
      const sessionScore = createSessionScore({
        project_id: isolatedProjectId,
        session_id: sessionId,
        name: "session_rating",
        source: "ANNOTATION",
        data_type: "NUMERIC",
      });

      const traceScore = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId,
        observation_id: null,
        name: "trace_score",
        source: "API",
        data_type: "NUMERIC",
      });

      await createScoresCh([sessionScore, traceScore]);

      // Filter for session-level scores only
      const result = await getScoresGroupedByNameSourceType({
        projectId: isolatedProjectId,
        filter: [
          {
            column: "traceId",
            operator: "is null",
            value: "",
            type: "null",
          },
          {
            column: "sessionId",
            operator: "is not null",
            value: "",
            type: "null",
          },
        ],
        fromTimestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        toTimestamp: new Date(), // now
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "session_rating",
        source: "ANNOTATION",
        dataType: "NUMERIC",
      });
    });

    it("should return grouped observation scores by observation filters", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const traceId = v4();
      const observationId1 = v4();
      const observationId2 = v4();

      // Create trace
      const trace = createTrace({ id: traceId, project_id: isolatedProjectId });
      await createTracesCh([trace]);

      // Create observations
      const obs1 = createObservation({
        id: observationId1,
        trace_id: traceId,
        project_id: isolatedProjectId,
      });
      const obs2 = createObservation({
        id: observationId2,
        trace_id: traceId,
        project_id: isolatedProjectId,
      });
      await createObservationsCh([obs1, obs2]);

      // Create observation scores and trace scores
      const observationScore = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId,
        observation_id: observationId1,
        name: "observation_quality",
        source: "EVAL",
        data_type: "CATEGORICAL",
      });

      const traceScore = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId,
        observation_id: null,
        name: "trace_accuracy",
        source: "API",
        data_type: "NUMERIC",
      });

      await createScoresCh([observationScore, traceScore]);

      // Filter for observation-level scores only
      const result = await getScoresGroupedByNameSourceType({
        projectId: isolatedProjectId,
        filter: [
          {
            column: "observationId",
            operator: "is not null",
            value: "",
            type: "null",
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "observation_quality",
        source: "EVAL",
        dataType: "CATEGORICAL",
      });
    });
  });

  describe("getScoresUiTable", () => {
    it("should return empty array when no scores match filter", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();

      const result = await getScoresUiTable({
        projectId: isolatedProjectId,
        filter: [],
        orderBy: { column: "timestamp", order: "DESC" },
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual([]);
    });

    it("should return scores with trace metadata", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const traceId = v4();
      const userId = "test-user";
      const traceName = "test-trace";

      const trace = createTrace({
        id: traceId,
        project_id: isolatedProjectId,
        user_id: userId,
        name: traceName,
        tags: ["tag1", "tag2"],
      });
      await createTracesCh([trace]);

      const score = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId,
        name: "accuracy",
        value: 0.95,
        source: "API",
        data_type: "NUMERIC",
      });
      await createScoresCh([score]);

      const result = await getScoresUiTable({
        projectId: isolatedProjectId,
        filter: [],
        orderBy: { column: "timestamp", order: "DESC" },
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: score.id,
        name: "accuracy",
        value: 0.95,
        traceUserId: userId,
        traceName: traceName,
        traceTags: ["tag1", "tag2"],
      });
    });

    it("should filter scores by name", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();

      const score1 = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: v4(),
        name: "accuracy",
        source: "API",
      });
      const score2 = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: v4(),
        name: "precision",
        source: "API",
      });
      await createScoresCh([score1, score2]);

      const result = await getScoresUiTable({
        projectId: isolatedProjectId,
        filter: [
          {
            column: "name",
            operator: "=",
            value: "accuracy",
            type: "string",
          },
        ],
        orderBy: { column: "timestamp", order: "DESC" },
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("accuracy");
    });

    it("should exclude metadata when flag is set", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();

      const score = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: v4(),
        name: "test",
        metadata: { key: "value" },
      });
      await createScoresCh([score]);

      const result = await getScoresUiTable({
        projectId: isolatedProjectId,
        filter: [],
        orderBy: { column: "timestamp", order: "DESC" },
        limit: 10,
        offset: 0,
        excludeMetadata: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].metadata).toEqual({});
    });
  });

  describe("getScoresForTraces", () => {
    it("should return empty array when no scores exist for traces", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();

      const result = await getScoresForTraces({
        projectId: isolatedProjectId,
        traceIds: [v4()],
      });

      expect(result).toEqual([]);
    });

    it("should return scores for given trace ids", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const traceId1 = v4();
      const traceId2 = v4();

      const trace1 = createTrace({
        id: traceId1,
        project_id: isolatedProjectId,
      });
      const trace2 = createTrace({
        id: traceId2,
        project_id: isolatedProjectId,
      });
      await createTracesCh([trace1, trace2]);

      const score1 = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId1,
        name: "score1",
        value: 0.8,
      });
      const score2 = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId2,
        name: "score2",
        value: 0.9,
      });
      const score3 = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: v4(),
        name: "score3",
      });
      await createScoresCh([score1, score2, score3]);

      const result = await getScoresForTraces({
        projectId: isolatedProjectId,
        traceIds: [traceId1, traceId2],
      });

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.name).sort()).toEqual(["score1", "score2"]);
    });

    it("should exclude metadata when excludeMetadata is true", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const traceId = v4();

      const trace = createTrace({ id: traceId, project_id: isolatedProjectId });
      await createTracesCh([trace]);

      const score = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId,
        metadata: { key: "value" },
      });
      await createScoresCh([score]);

      const result = await getScoresForTraces({
        projectId: isolatedProjectId,
        traceIds: [traceId],
        excludeMetadata: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].metadata).toEqual({});
    });

    it("should include hasMetadata flag when includeHasMetadata is true", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const traceId = v4();

      const trace = createTrace({ id: traceId, project_id: isolatedProjectId });
      await createTracesCh([trace]);

      const scoreWithMeta = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId,
        metadata: { key: "value" },
      });
      await createScoresCh([scoreWithMeta]);

      const result = await getScoresForTraces({
        projectId: isolatedProjectId,
        traceIds: [traceId],
        includeHasMetadata: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("hasMetadata", true);
    });
  });

  describe("getScoresForObservations", () => {
    it("should return empty array when no scores exist for observations", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();

      const result = await getScoresForObservations({
        projectId: isolatedProjectId,
        observationIds: [v4()],
      });

      expect(result).toEqual([]);
    });

    it("should return scores for given observation ids", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const traceId = v4();
      const obsId1 = v4();
      const obsId2 = v4();

      const trace = createTrace({ id: traceId, project_id: isolatedProjectId });
      await createTracesCh([trace]);

      const obs1 = createObservation({
        id: obsId1,
        trace_id: traceId,
        project_id: isolatedProjectId,
      });
      const obs2 = createObservation({
        id: obsId2,
        trace_id: traceId,
        project_id: isolatedProjectId,
      });
      await createObservationsCh([obs1, obs2]);

      const score1 = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId,
        observation_id: obsId1,
        name: "obs_score1",
      });
      const score2 = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId,
        observation_id: obsId2,
        name: "obs_score2",
      });
      await createScoresCh([score1, score2]);

      const result = await getScoresForObservations({
        projectId: isolatedProjectId,
        observationIds: [obsId1],
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("obs_score1");
    });

    it("should exclude metadata when excludeMetadata is true", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const traceId = v4();
      const obsId = v4();

      const trace = createTrace({ id: traceId, project_id: isolatedProjectId });
      await createTracesCh([trace]);

      const obs = createObservation({
        id: obsId,
        trace_id: traceId,
        project_id: isolatedProjectId,
      });
      await createObservationsCh([obs]);

      const score = createTraceScore({
        project_id: isolatedProjectId,
        trace_id: traceId,
        observation_id: obsId,
        metadata: { key: "value" },
      });
      await createScoresCh([score]);

      const result = await getScoresForObservations({
        projectId: isolatedProjectId,
        observationIds: [obsId],
        excludeMetadata: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].metadata).toEqual({});
    });
  });

  describe("getScoresForSessions", () => {
    it("should return empty array when no scores exist for sessions", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();

      const result = await getScoresForSessions({
        projectId: isolatedProjectId,
        sessionIds: [v4()],
      });

      expect(result).toEqual([]);
    });

    it("should return scores for given session ids", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const sessionId1 = v4();
      const sessionId2 = v4();

      const score1 = createSessionScore({
        project_id: isolatedProjectId,
        session_id: sessionId1,
        name: "session_score1",
        value: 0.7,
      });
      const score2 = createSessionScore({
        project_id: isolatedProjectId,
        session_id: sessionId2,
        name: "session_score2",
        value: 0.85,
      });
      const score3 = createSessionScore({
        project_id: isolatedProjectId,
        session_id: v4(),
        name: "session_score3",
      });
      await createScoresCh([score1, score2, score3]);

      const result = await getScoresForSessions({
        projectId: isolatedProjectId,
        sessionIds: [sessionId1, sessionId2],
      });

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.name).sort()).toEqual([
        "session_score1",
        "session_score2",
      ]);
    });

    it("should exclude metadata when excludeMetadata is true", async () => {
      const { projectId: isolatedProjectId } =
        await createOrgProjectAndApiKey();
      const sessionId = v4();

      const score = createSessionScore({
        project_id: isolatedProjectId,
        session_id: sessionId,
        metadata: { key: "value" },
      });
      await createScoresCh([score]);

      const result = await getScoresForSessions({
        projectId: isolatedProjectId,
        sessionIds: [sessionId],
        excludeMetadata: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].metadata).toEqual({});
    });
  });
});
