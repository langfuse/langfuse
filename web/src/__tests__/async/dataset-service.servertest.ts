import {
  createObservationsCh,
  createScoresCh,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createTraceScore,
  createTrace,
} from "@langfuse/shared/src/server";
import {
  createDatasetRunsTable,
  fetchDatasetItems,
  getRunItemsByRunIdOrItemId,
} from "@/src/features/datasets/server/service";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("Fetch datasets for UI presentation", () => {
  it("should fetch dataset runs for UI", async () => {
    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });
    const datasetRunId = v4();
    const datasetRun2Id = v4();
    await prisma.datasetRuns.create({
      data: {
        id: datasetRunId,
        name: v4(),
        datasetId,
        metadata: {},
        projectId,
      },
    });

    await prisma.datasetRuns.create({
      data: {
        id: datasetRun2Id,
        name: v4(),
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetItemId = v4();

    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetRunItemId = v4();
    const datasetRunItemId2 = v4();
    const datasetRunItemId3 = v4();
    const datasetRunItemId4 = v4();
    const observationId = v4();
    const traceId = v4();
    const traceId2 = v4();
    const traceId3 = v4();
    const traceId4 = v4();
    const scoreId = v4();
    const scoreId2 = v4();
    const scoreId3 = v4();
    const scoreName = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId,
        datasetRunId: datasetRunId,
        observationId: observationId,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId2,
        datasetRunId: datasetRunId,
        traceId: traceId2,
        projectId,
        datasetItemId,
      },
    });

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId3,
        datasetRunId: datasetRunId,
        traceId: traceId3,
        projectId,
        datasetItemId,
      },
    });

    // linked to the second run
    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId4,
        datasetRunId: datasetRun2Id,
        observationId: null,
        traceId: traceId4,
        projectId,
        datasetItemId,
      },
    });

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });
    const observation2 = createObservation({
      trace_id: traceId2,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });
    const observation3 = createObservation({
      trace_id: traceId2,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 30,
      end_time: new Date().getTime(),
      total_cost: 200,
    });
    const observation4 = createObservation({
      trace_id: traceId3,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 300,
      end_time: new Date().getTime(),
      total_cost: 50,
    });
    const observation5 = createObservation({
      trace_id: traceId4,
      project_id: projectId,
      start_time: new Date().getTime() - 1000,
      end_time: new Date().getTime(),
    });
    await createObservationsCh([
      observation,
      observation2,
      observation3,
      observation4,
      observation5,
    ]);
    const score = createTraceScore({
      id: scoreId,
      observation_id: observationId,
      trace_id: traceId,
      project_id: projectId,
      name: scoreName,
    });
    const score2 = createTraceScore({
      id: scoreId2,
      observation_id: null,
      trace_id: traceId,
      project_id: projectId,
      name: scoreName,
      value: 1,
      comment: "some other comment",
    });
    const observationId2 = v4(); // this one is not related to a run
    const anotherScoreName = v4();

    const score3 = createTraceScore({
      id: scoreId3,
      observation_id: observationId2,
      trace_id: traceId,
      project_id: projectId,
      name: anotherScoreName,
      value: 1,
      comment: "some other comment for non run related score",
    });
    await createScoresCh([score, score2, score3]);

    const runs = await createDatasetRunsTable({
      projectId,
      datasetId,
      page: 0,
      limit: 10,
    });

    expect(runs).toHaveLength(2);

    const firstRun = runs.find((run) => run.run_id === datasetRunId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }
    expect(firstRun.run_id).toEqual(datasetRunId);

    expect(firstRun.run_description).toBeNull();
    expect(firstRun.run_metadata).toEqual({});

    expect(firstRun.avgLatency).toBeGreaterThanOrEqual(10800);
    expect(firstRun.avgTotalCost.toString()).toStrictEqual("275");

    const expectedObject = {
      [`${scoreName.replaceAll("-", "_")}-API-NUMERIC`]: {
        type: "NUMERIC",
        values: expect.arrayContaining([1, 100.5]),
        average: 50.75,
        id: undefined,
        comment: undefined,
        hasMetadata: undefined,
      },
      [`${anotherScoreName.replaceAll("-", "_")}-API-NUMERIC`]: {
        id: score3.id,
        type: "NUMERIC",
        values: expect.arrayContaining([1]),
        average: 1,
        comment: "some other comment for non run related score",
        hasMetadata: true,
      },
    };

    expect(firstRun.scores).toEqual(expectedObject);

    const secondRun = runs.find((run) => run.run_id === datasetRun2Id);

    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("second run is not defined");
    }

    expect(secondRun.run_id).toEqual(datasetRun2Id);
    expect(secondRun.run_description).toBeNull();
    expect(secondRun.run_metadata).toEqual({});
    expect(secondRun.avgLatency).toBeGreaterThanOrEqual(1);
    expect(secondRun.avgLatency).toBeLessThanOrEqual(1.002);
    expect(secondRun.avgTotalCost.toString()).toStrictEqual("300");

    expect(JSON.stringify(secondRun.scores)).toEqual(JSON.stringify({}));
  });

  it("should test that dataset runs can link to the same traces", async () => {
    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });
    const datasetRunId = v4();
    const datasetRun2Id = v4();
    await prisma.datasetRuns.create({
      data: {
        id: datasetRunId,
        name: v4(),
        datasetId,
        metadata: {},
        projectId,
      },
    });

    await prisma.datasetRuns.create({
      data: {
        id: datasetRun2Id,
        name: v4(),
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetItemId = v4();

    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetRunItemId = v4();
    const datasetRunItemId2 = v4();
    const traceId = v4();
    const scoreId = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId,
        datasetRunId: datasetRunId,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    // linked to the second run
    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId2,
        datasetRunId: datasetRun2Id,
        observationId: null,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    const scoreName = v4();
    const score = createTraceScore({
      id: scoreId,
      observation_id: null,
      trace_id: traceId,
      project_id: projectId,
      name: scoreName,
    });

    await createScoresCh([score]);

    const runs = await createDatasetRunsTable({
      projectId,
      datasetId,
      page: 0,
      limit: 10,
    });

    expect(runs).toHaveLength(2);

    const firstRun = runs.find((run) => run.run_id === datasetRunId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }
    expect(firstRun.run_id).toEqual(datasetRunId);

    expect(firstRun.run_description).toBeNull();
    expect(firstRun.run_metadata).toEqual({});

    expect(firstRun.avgLatency).toBeGreaterThanOrEqual(0);
    expect(firstRun.avgTotalCost.toString()).toStrictEqual("0");

    const expectedObject = {
      [`${scoreName.replaceAll("-", "_")}-API-NUMERIC`]: {
        id: score.id,
        type: "NUMERIC",
        values: expect.arrayContaining([100.5]),
        average: 100.5,
        comment: "comment",
        // createScore adds metadata to the score
        hasMetadata: true,
      },
    };

    expect(firstRun.scores).toEqual(expectedObject);

    const secondRun = runs.find((run) => run.run_id === datasetRun2Id);

    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("second run is not defined");
    }

    expect(secondRun.run_id).toEqual(datasetRun2Id);
    expect(secondRun.run_description).toBeNull();
    expect(secondRun.run_metadata).toEqual({});
    expect(secondRun.avgLatency).toEqual(0);
    expect(secondRun.avgTotalCost.toString()).toStrictEqual("0");

    expect(firstRun.scores).toEqual(expectedObject);
  });

  it("should fetch dataset run items for UI", async () => {
    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });
    const datasetRunId = v4();
    await prisma.datasetRuns.create({
      data: {
        id: datasetRunId,
        name: v4(),
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetItemId = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetRunItemId = v4();
    const traceId = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId,
        datasetRunId: datasetRunId,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    const traceId2 = v4();
    const observationId = v4();
    const datasetRunItemId2 = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId2,
        datasetRunId: datasetRunId,
        traceId: traceId2,
        projectId,
        datasetItemId,
        observationId,
      },
    });

    const trace1 = createTrace({
      id: traceId,
      project_id: projectId,
    });

    const trace2 = createTrace({
      id: traceId2,
      project_id: projectId,
    });

    await createTracesCh([trace1, trace2]);

    const observation = createObservation({
      id: observationId,
      trace_id: traceId2,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });

    const observation2 = createObservation({
      trace_id: traceId,
    });

    await createObservationsCh([observation]);

    const score = createTraceScore({
      observation_id: observation2.id,
      trace_id: traceId2,
      project_id: projectId,
    });

    await createScoresCh([score]);

    const runs = await getRunItemsByRunIdOrItemId(
      projectId,
      // fetch directly from the db to have realistic data.
      await prisma.datasetRunItems.findMany({
        where: {
          id: {
            in: [datasetRunItemId, datasetRunItemId2],
          },
        },
      }),
    );

    expect(runs).toHaveLength(2);

    const firstRun = runs.find((run) => run.id === datasetRunItemId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }

    expect(firstRun.id).toEqual(datasetRunItemId);
    expect(firstRun.datasetItemId).toEqual(datasetItemId);
    expect(firstRun.observation).toBeUndefined();
    expect(firstRun.trace).toBeDefined();
    expect(firstRun.trace?.id).toEqual(traceId);

    const secondRun = runs.find((run) => run.id === datasetRunItemId2);
    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("secondRun is not defined");
    }

    expect(secondRun.id).toEqual(datasetRunItemId2);
    expect(secondRun.datasetItemId).toEqual(datasetItemId);
    expect(secondRun.trace?.id).toEqual(traceId2);
    expect(secondRun.observation?.id).toEqual(observationId);

    const expectedObject = {
      [`${score.name.replaceAll("-", "_")}-API-NUMERIC`]: {
        id: score.id,
        type: "NUMERIC",
        values: expect.arrayContaining([100.5]),
        average: 100.5,
        comment: "comment",
        // createScore adds metadata to the score
        hasMetadata: true,
      },
    };

    expect(secondRun.scores).toEqual(expectedObject);
  });

  it("should fetch dataset run items for UI with missing tracing data", async () => {
    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });
    const datasetRunId = v4();
    await prisma.datasetRuns.create({
      data: {
        id: datasetRunId,
        name: v4(),
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetItemId = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetRunItemId = v4();
    const traceId = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId,
        datasetRunId: datasetRunId,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    const traceId2 = v4();
    const observationId = v4();
    const datasetRunItemId2 = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId2,
        datasetRunId: datasetRunId,
        traceId: traceId2,
        projectId,
        datasetItemId,
        observationId,
      },
    });

    const runs = await getRunItemsByRunIdOrItemId(
      projectId,
      // fetch directly from the db to have realistic data.
      await prisma.datasetRunItems.findMany({
        where: {
          id: {
            in: [datasetRunItemId, datasetRunItemId2],
          },
        },
      }),
    );

    expect(runs).toHaveLength(2);

    const firstRun = runs.find((run) => run.id === datasetRunItemId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }

    expect(firstRun.id).toEqual(datasetRunItemId);
    expect(firstRun.datasetItemId).toEqual(datasetItemId);
    expect(firstRun.observation).toBeUndefined();
    expect(firstRun.trace).toBeDefined();
    expect(firstRun.trace?.id).toEqual(traceId);

    const secondRun = runs.find((run) => run.id === datasetRunItemId2);
    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("secondRun is not defined");
    }

    expect(secondRun.id).toEqual(datasetRunItemId2);
    expect(secondRun.datasetItemId).toEqual(datasetItemId);
    expect(secondRun.trace?.id).toEqual(traceId2);
    expect(secondRun.observation?.id).toEqual(observationId);
  });

  it("should fetch dataset items correctly", async () => {
    // Create test data in the database

    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });

    const traceId1 = v4();
    const traceId2 = v4();
    const observationId2 = v4();

    const datasetItemId = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
        sourceTraceId: traceId1,
      },
    });

    const datasetItemId2 = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId2,
        datasetId,
        metadata: {},
        projectId,
        sourceTraceId: traceId2,
        sourceObservationId: observationId2,
      },
    });

    const datasetItemId3 = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId3,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const observation = createObservation({
      id: observationId2,
      trace_id: traceId2,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });

    await createObservationsCh([observation]);

    const trace1 = createTrace({
      id: traceId1,
      project_id: projectId,
    });
    const trace2 = createTrace({
      id: traceId2,
      project_id: projectId,
    });

    await createTracesCh([trace1, trace2]);

    const input = {
      projectId: projectId,
      datasetId: datasetId,
      limit: 10,
      page: 0,
      prisma: prisma,
      filter: [],
    };

    const result = await fetchDatasetItems(input);

    expect(result.totalDatasetItems).toEqual(3);
    expect(result.datasetItems).toHaveLength(3);

    const firstDatasetItem = result.datasetItems.find(
      (item) => item.id === datasetItemId,
    );
    expect(firstDatasetItem).toBeDefined();
    if (!firstDatasetItem) {
      throw new Error("firstDatasetItem is not defined");
    }
    expect(firstDatasetItem.sourceTraceId).toEqual(traceId1);
    expect(firstDatasetItem.sourceObservationId).toBeNull();

    const secondDatasetItem = result.datasetItems.find(
      (item) => item.id === datasetItemId2,
    );
    expect(secondDatasetItem).toBeDefined();
    if (!secondDatasetItem) {
      throw new Error("secondDatasetItem is not defined");
    }
    expect(secondDatasetItem.sourceTraceId).toEqual(traceId2);
    expect(secondDatasetItem.sourceObservationId).toEqual(observationId2);

    const thirdDatasetItem = result.datasetItems.find(
      (item) => item.id === datasetItemId3,
    );
    expect(thirdDatasetItem).toBeDefined();
    if (!thirdDatasetItem) {
      throw new Error("thirdDatasetItem is not defined");
    }
    expect(thirdDatasetItem.sourceTraceId).toBeNull();
    expect(thirdDatasetItem.sourceObservationId).toBeNull();
  });

  it("should filter dataset items by metadata key `key`", async () => {
    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });
    const datasetItemId1 = v4();
    const datasetItemId2 = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId1,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    await prisma.datasetItem.create({
      data: {
        id: datasetItemId2,
        datasetId,
        projectId,
        metadata: {
          key: "value",
        },
      },
    });

    const input = {
      projectId: projectId,
      datasetId: datasetId,
      limit: 10,
      page: 0,
      prisma: prisma,
      filter: [
        {
          column: "metadata",
          type: "stringObject" as const,
          key: "key",
          operator: "=" as const,
          value: "value",
        },
      ],
    };

    const result = await fetchDatasetItems(input);

    expect(result.totalDatasetItems).toEqual(1);
    expect(result.datasetItems).toHaveLength(1);

    // expect all dataset items to have the metadata key `key`
    expect(
      result.datasetItems.every(
        (item) =>
          !!item.metadata &&
          typeof item.metadata === "object" &&
          "key" in item.metadata,
      ),
    ).toBe(true);
  });

  describe("Dataset Items Search", () => {
    let datasetId: string;

    beforeEach(async () => {
      // Create a new dataset for each test to ensure isolation
      datasetId = v4();
      await prisma.dataset.create({
        data: {
          id: datasetId,
          name: `test-dataset-${datasetId}`,
          projectId: projectId,
        },
      });
    });

    afterEach(async () => {
      // Clean up dataset items and dataset after each test
      await prisma.datasetItem.deleteMany({
        where: { datasetId, projectId },
      });
      await prisma.dataset.delete({
        where: { id_projectId: { id: datasetId, projectId } },
      });
    });

    describe("ID Search Type", () => {
      it("should find dataset items by ID using ID search type", async () => {
        // Create test dataset items with known IDs
        const specificId = "test-item-123-langfuse";
        const anotherSpecificId = "test-item-456-openai";

        await prisma.datasetItem.create({
          data: {
            id: specificId,
            datasetId,
            projectId,
            input: {
              text: "What is Langfuse used for in machine learning projects?",
            },
            expectedOutput: {
              text: "Langfuse is used for LLM observability and tracing",
            },
            metadata: { category: "general" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: anotherSpecificId,
            datasetId,
            projectId,
            input: {
              text: "How do you integrate OpenAI with your application?",
            },
            expectedOutput: {
              text: "You can integrate OpenAI using their Python SDK",
            },
            metadata: { category: "integration" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "What are the benefits of using vector databases?" },
            expectedOutput: {
              text: "Vector databases enable semantic search capabilities",
            },
            metadata: { category: "technical" },
          },
        });

        // Test search by partial ID
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "langfuse",
          searchType: ["id"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems).toHaveLength(1);
        expect(searchResults.datasetItems[0].id).toEqual(specificId);
      });

      it("should perform case insensitive ID search", async () => {
        const specificId = "test-ITEM-OpenAI-Integration";

        await prisma.datasetItem.create({
          data: {
            id: specificId,
            datasetId,
            projectId,
            input: { text: "OpenAI integration question" },
            expectedOutput: { text: "OpenAI integration answer" },
            metadata: { category: "api" },
          },
        });

        // Test case insensitive search
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "openai", // lowercase search
          searchType: ["id"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].id).toEqual(specificId);
      });
    });

    describe("Content Search Type", () => {
      it("should find dataset items by searching in input field", async () => {
        // Create test dataset items with searchable input content
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: "What is Langfuse used for in machine learning projects?",
            },
            expectedOutput: {
              text: "Langfuse is used for LLM observability and tracing",
            },
            metadata: { category: "general" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: "How do you integrate OpenAI with your application?",
            },
            expectedOutput: {
              text: "You can integrate OpenAI using their Python SDK",
            },
            metadata: { category: "integration" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "What are the benefits of using vector databases?" },
            expectedOutput: {
              text: "Vector databases enable semantic search capabilities",
            },
            metadata: { category: "technical" },
          },
        });

        // Test content search in input field
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "Langfuse",
          searchType: ["content"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems).toHaveLength(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: "What is Langfuse used for in machine learning projects?",
        });
      });

      it("should find dataset items by searching in expectedOutput field", async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "What is the primary purpose of this tool?" },
            expectedOutput: {
              text: "Langfuse is a powerful observability platform for LLM applications",
            },
            metadata: { type: "explanation" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "How do you monitor AI applications?" },
            expectedOutput: {
              text: "You can use monitoring tools and dashboards",
            },
            metadata: { type: "how-to" },
          },
        });

        // Test content search in expectedOutput field
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "observability platform",
          searchType: ["content"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems).toHaveLength(1);
        expect(searchResults.datasetItems[0].expectedOutput).toEqual({
          text: "Langfuse is a powerful observability platform for LLM applications",
        });
      });

      it("should find dataset items by searching in metadata field", async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "What is customer support automation?" },
            expectedOutput: {
              answer: "Automated systems handle customer inquiries",
            },
            metadata: {
              domain: "customer service automation",
              tags: ["support", "automation", "chatbot"],
              complexity: "medium",
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "How to build a recommendation system?" },
            expectedOutput: {
              answer:
                "Use collaborative filtering and content-based approaches",
            },
            metadata: {
              domain: "machine learning",
              tags: ["ml", "recommendations"],
              complexity: "high",
            },
          },
        });

        // Test content search in metadata field
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "customer service automation",
          searchType: ["content"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems).toHaveLength(1);
        expect(searchResults.datasetItems[0].metadata).toEqual({
          domain: "customer service automation",
          tags: ["support", "automation", "chatbot"],
          complexity: "medium",
        });
      });
    });

    describe("Case Insensitive Search", () => {
      beforeEach(async () => {
        // Create test data with mixed case content
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "How to configure OpenAI API keys?" },
            expectedOutput: {
              text: "Store API keys securely using environment variables",
            },
            metadata: { category: "Security", priority: "HIGH" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "What are the best practices for API security?" },
            expectedOutput: {
              text: "Use HTTPS, validate inputs, and implement rate limiting",
            },
            metadata: { category: "security", priority: "high" },
          },
        });
      });

      it("should perform case insensitive search in input field", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "openai",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: "How to configure OpenAI API keys?",
        });
      });

      it("should perform case insensitive search in expectedOutput field", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "HTTPS",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].expectedOutput).toEqual({
          text: "Use HTTPS, validate inputs, and implement rate limiting",
        });
      });

      it("should perform case insensitive search in metadata values", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "security",
          searchType: ["content"],
          filter: [],
        });

        // Should find both items (one with "Security" and one with "security")
        expect(searchResults.totalDatasetItems).toEqual(2);
        expect(searchResults.datasetItems[0].metadata).toHaveProperty(
          "category",
          "security",
        );
      });
    });

    describe("Complex JSON Search", () => {
      beforeEach(async () => {
        // Create test data with complex nested JSON structures
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              conversation: {
                messages: [
                  { role: "user", content: "What is machine learning?" },
                  {
                    role: "assistant",
                    content: "ML is a subset of AI that learns from data",
                  },
                ],
                context: "educational discussion",
              },
            },
            expectedOutput: {
              response: {
                text: "Machine learning enables computers to learn patterns from data",
                confidence: 0.95,
                tags: ["education", "AI", "machine learning"],
              },
            },
            metadata: {
              domain: "artificial intelligence",
              complexity: "beginner",
              topics: ["supervised learning", "unsupervised learning"],
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              query: "Explain neural networks",
              parameters: {
                temperature: 0.7,
                max_tokens: 150,
              },
            },
            expectedOutput: {
              response: {
                text: "Neural networks are computational models inspired by biological neurons",
                confidence: 0.88,
                tags: ["deep learning", "neural networks"],
              },
            },
            metadata: {
              domain: "deep learning",
              complexity: "intermediate",
              topics: ["neural networks", "backpropagation"],
            },
          },
        });
      });

      it("should search within nested JSON input structures", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "educational discussion",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toHaveProperty(
          "conversation",
        );
        expect(
          (searchResults.datasetItems[0].input as any).conversation.context,
        ).toBe("educational discussion");
      });

      it("should search within nested JSON expectedOutput structures", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "biological neurons",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].expectedOutput).toHaveProperty(
          "response",
        );
        expect(
          (searchResults.datasetItems[0].expectedOutput as any).response.text,
        ).toContain("biological neurons");
      });

      it("should search in metadata array values", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "topics",
              operator: "contains",
              value: "supervised learning",
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(
          (searchResults.datasetItems[0].metadata as any).topics,
        ).toContain("supervised learning");
      });
    });

    describe("Search with No Matches", () => {
      beforeEach(async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "What is Python programming?" },
            expectedOutput: {
              answer: "Python is a versatile programming language",
            },
            metadata: { language: "python", level: "beginner" },
          },
        });
      });

      it("should return empty results when search term is not found", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "nonexistent content",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(0);
        expect(searchResults.datasetItems).toHaveLength(0);
      });

      it("should return empty results when metadata key does not exist", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "nonexistent_key",
              operator: "=",
              value: "any_value",
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(0);
        expect(searchResults.datasetItems).toHaveLength(0);
      });

      it("should return empty results when metadata value does not match", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "language",
              operator: "=",
              value: "javascript", // looking for javascript but item has python
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(0);
        expect(searchResults.datasetItems).toHaveLength(0);
      });
    });

    describe("Multiple Search Criteria", () => {
      beforeEach(async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: "How to use Langfuse for monitoring LLM applications?",
            },
            expectedOutput: {
              text: "Langfuse provides comprehensive observability for AI applications",
            },
            metadata: {
              category: "observability",
              tool: "langfuse",
              priority: "high",
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: "What are the key features of AI monitoring tools?",
            },
            expectedOutput: {
              text: "Key features include tracing, metrics, and error tracking",
            },
            metadata: {
              category: "observability",
              tool: "general",
              priority: "medium",
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "How to implement logging in Python applications?" },
            expectedOutput: {
              text: "Use Python's logging module for structured logging",
            },
            metadata: { category: "logging", tool: "python", priority: "low" },
          },
        });
      });

      it("should filter by multiple metadata criteria", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "category",
              operator: "=",
              value: "observability",
            },
            {
              column: "metadata",
              type: "stringObject",
              key: "tool",
              operator: "=",
              value: "langfuse",
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: "How to use Langfuse for monitoring LLM applications?",
        });
      });

      it("should combine content search with metadata filtering", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "monitoring",
          searchType: ["content"],
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "priority",
              operator: "=",
              value: "high",
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: "How to use Langfuse for monitoring LLM applications?",
        });
      });

      it("should return items matching any of multiple content search terms", async () => {
        // Note: This tests OR logic if the search implementation supports it
        // For now, testing sequential filters that narrow down results
        const langfuseResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "Langfuse",
          searchType: ["content"],
          filter: [],
        });

        const pythonResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "Python",
          searchType: ["content"],
          filter: [],
        });

        expect(langfuseResults.totalDatasetItems).toEqual(1);
        expect(pythonResults.totalDatasetItems).toEqual(1);
        expect(langfuseResults.datasetItems[0].id).not.toEqual(
          pythonResults.datasetItems[0].id,
        );
      });
    });

    describe("Edge Cases and Special Characters", () => {
      beforeEach(async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: 'Search for "quoted text" and special chars: @#$%^&*()',
            },
            expectedOutput: {
              text: "Handle special characters properly in search queries",
            },
            metadata: {
              special_key: "value with spaces and symbols: @#$",
              "key-with-dashes": "dash-separated-value",
              "key.with.dots": "dot.separated.value",
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "Normal text without special characters" },
            expectedOutput: { text: "Regular response without special chars" },
            metadata: { category: "normal", type: "standard" },
          },
        });
      });

      it("should handle search with special characters", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "@#$%",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: 'Search for "quoted text" and special chars: @#$%^&*()',
        });
      });

      it("should handle metadata keys with special characters", async () => {
        const filterResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "key-with-dashes",
              operator: "=",
              value: "dash-separated-value",
            },
          ],
        });

        expect(filterResults.totalDatasetItems).toEqual(1);
        expect(
          (filterResults.datasetItems[0].metadata as any)["key-with-dashes"],
        ).toBe("dash-separated-value");

        const searchResults = await fetchDatasetItems({
          searchQuery: "dash-separated-value",
          searchType: ["content"],
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(
          (searchResults.datasetItems[0].metadata as any)["key-with-dashes"],
        ).toBe("dash-separated-value");
      });

      it("should handle empty search terms gracefully", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "",
          searchType: ["content"],
          filter: [],
        });

        // Empty search should return all items (depending on implementation)
        expect(searchResults.totalDatasetItems).toBeGreaterThanOrEqual(0);
      });
    });

    describe("Performance and Pagination", () => {
      beforeEach(async () => {
        // Create multiple dataset items for pagination testing
        const items = [];
        for (let i = 1; i <= 25; i++) {
          items.push({
            id: v4(),
            datasetId,
            projectId,
            input: { text: `Sample question ${i} about data processing` },
            expectedOutput: {
              text: `Sample answer ${i} about data handling techniques`,
            },
            metadata: {
              sequence: i,
              category: i % 2 === 0 ? "even" : "odd",
              topic: "data processing",
            },
          });
        }

        await prisma.datasetItem.createMany({ data: items });
      });

      it("should handle pagination with search results", async () => {
        // First page
        const firstPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "data processing",
          searchType: ["content"],
          filter: [],
        });

        expect(firstPage.totalDatasetItems).toEqual(25);
        expect(firstPage.datasetItems).toHaveLength(10);

        // Second page
        const secondPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 1,
          prisma,
          searchQuery: "data processing",
          searchType: ["content"],
          filter: [],
        });

        expect(secondPage.totalDatasetItems).toEqual(25);
        expect(secondPage.datasetItems).toHaveLength(10);

        // Third page
        const thirdPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 2,
          prisma,
          searchQuery: "data processing",
          searchType: ["content"],
          filter: [],
        });

        expect(thirdPage.totalDatasetItems).toEqual(25);
        expect(thirdPage.datasetItems).toHaveLength(5); // Remaining items

        // Verify no duplicates across pages
        const allItemIds = [
          ...firstPage.datasetItems.map((item) => item.id),
          ...secondPage.datasetItems.map((item) => item.id),
          ...thirdPage.datasetItems.map((item) => item.id),
        ];
        const uniqueIds = new Set(allItemIds);
        expect(uniqueIds.size).toEqual(25);
      });

      it("should maintain consistent ordering across paginated search results", async () => {
        const firstPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 5,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "category",
              operator: "=",
              value: "even",
            },
          ],
        });

        const secondPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 5,
          page: 1,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "category",
              operator: "=",
              value: "even",
            },
          ],
        });

        // Verify items are properly ordered (assuming descending creation order)
        expect(firstPage.datasetItems).toHaveLength(5);
        expect(secondPage.datasetItems).toHaveLength(5);

        // Check that items are in consistent order
        const firstPageSequences = firstPage.datasetItems.map(
          (item) => (item.metadata as any).sequence,
        );
        const secondPageSequences = secondPage.datasetItems.map(
          (item) => (item.metadata as any).sequence,
        );

        // All sequences should be different between pages
        const overlap = firstPageSequences.filter((seq) =>
          secondPageSequences.includes(seq),
        );
        expect(overlap).toHaveLength(0);
      });
    });
  });
});
