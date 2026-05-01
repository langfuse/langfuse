import {
  FileContent,
  SeederOptions,
  getTotalObservationsForMode,
} from "./types";
import { DataGenerator } from "./data-generators";
import { ClickHouseQueryBuilder } from "./clickhouse-builder";
import { FrameworkTraceLoader } from "./framework-traces/framework-trace-loader";
import { EVAL_TRACE_COUNT, SEED_DATASETS } from "./postgres-seed-constants";
import { MEDIA_TEST_TRACE_IDS, getSeedMediaFixture } from "../seed-media";
import {
  clickhouseClient,
  createTrace,
  DatasetRunItemRecordInsertType,
  logger,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import path from "path";
import { readFileSync } from "fs";

const DATASET_SCORE_NAMES = ["score-1", "score-2", "score-3"];
const DATASET_RUN_SCORE_NAMES = [
  "dataset-run-score-1",
  "dataset-run-score-2",
  "dataset-run-score-3",
];

/**
 * Orchestrates seeding operations across ClickHouse and PostgreSQL.
 *
 * Use createXxxData() for specific data types:
 * - createDatasetExperimentData(): Dataset runs in langfuse-prompt-experiment env
 * - createEvaluationData(): Evaluation data in langfuse-evaluation env
 * - createSyntheticData(): Large synthetic data in default env
 * - executeFullSeed(): All data types together
 */
export class SeederOrchestrator {
  private dataGenerator: DataGenerator;
  private queryBuilder: ClickHouseQueryBuilder;
  private fileContent: FileContent | null = null;

  constructor() {
    this.dataGenerator = DataGenerator.getInstance();
    this.queryBuilder = new ClickHouseQueryBuilder();
    this.loadFileContent();
  }

  private loadFileContent() {
    try {
      const nestedJsonPath = path.join(__dirname, "./nested_json.json");
      const heavyMarkdownPath = path.join(__dirname, "./markdown.txt");
      const chatMlJsonPath = path.join(__dirname, "./chat_ml_json.json");

      const nestedJsonContent = JSON.parse(
        readFileSync(nestedJsonPath, "utf-8"),
      );
      const heavyMarkdownContent = readFileSync(heavyMarkdownPath, "utf-8");
      const chatMlJsonContent = JSON.parse(
        readFileSync(chatMlJsonPath, "utf-8"),
      );

      // Truncate large content for reasonable test data size
      const truncatedNestedJson = {
        ...nestedJsonContent,
        products: nestedJsonContent.products?.slice(0, 3) || [],
      };

      const truncatedChatMlJson = {
        ...chatMlJsonContent,
        messages: chatMlJsonContent.messages?.slice(0, 4) || [],
      };

      this.fileContent = {
        nestedJson: truncatedNestedJson,
        heavyMarkdown: heavyMarkdownContent,
        chatMlJson: truncatedChatMlJson,
      };

      this.dataGenerator.setFileContent(this.fileContent);
    } catch (error) {
      logger.warn(
        "Could not load file content for seeding, using fallback data",
        error,
      );
    }
  }

  /**
   * Creates dataset experiment data for A/B testing and prompt comparisons.
   * Use for: Experiment tracking, dataset-based evaluations, prompt testing.
   */
  async createDatasetExperimentData(
    projectIds: string[],
    opts: SeederOptions,
  ): Promise<void> {
    logger.info(
      `Creating dataset experiment data for ${projectIds.length} projects.`,
    );

    for (const projectId of projectIds) {
      logger.info(`Processing project ${projectId}`);

      const numberOfRuns = opts.numberOfRuns || 1;

      for (let runNumber = 0; runNumber < numberOfRuns; runNumber++) {
        logger.info(
          `Processing run ${runNumber + 1}/${numberOfRuns} for project ${projectId}`,
        );
        const now = Date.now();

        const traces: TraceRecordInsertType[] = [];
        const observations: ObservationRecordInsertType[] = [];
        const datasetRunItems: DatasetRunItemRecordInsertType[] = [];
        const scores: ScoreRecordInsertType[] = [];

        for (const seedDataset of SEED_DATASETS) {
          if (!seedDataset.shouldRunExperiment) continue;

          for (const [itemIndex, datasetItem] of seedDataset.items.entries()) {
            // Generate dataset run item data
            const datasetRunItem = this.dataGenerator.generateDatasetRunItem(
              {
                datasetName: seedDataset.name,
                itemIndex,
                item: datasetItem,
                runNumber,
                runCreatedAt: now,
              },
              projectId,
            );

            // Generate trace data
            const trace = this.dataGenerator.generateDatasetTrace(
              {
                datasetName: seedDataset.name,
                itemIndex,
                item: datasetItem,
                runNumber,
              },
              projectId,
            );

            // Generate observation data
            const observation = this.dataGenerator.generateDatasetObservation(
              trace,
              {
                datasetName: seedDataset.name,
                itemIndex,
                item: datasetItem,
                runNumber,
              },
              projectId,
            );

            // Generate score data
            const score = this.dataGenerator.generateDatasetScore(
              trace,
              {
                datasetName: seedDataset.name,
                itemIndex,
                item: datasetItem,
                runNumber,
              },
              projectId,
              DATASET_SCORE_NAMES,
            );

            traces.push(trace);
            observations.push(observation);
            datasetRunItems.push(datasetRunItem);
            scores.push(score);
          }

          // create dataset run level scores
          const datasetRunScore = this.dataGenerator.generateDatasetRunScore(
            `${seedDataset.name}-${projectId.slice(-8)}`,
            {
              datasetName: seedDataset.name,
              runNumber,
            },
            projectId,
            DATASET_RUN_SCORE_NAMES,
          );
          scores.push(datasetRunScore);
        }

        try {
          await this.queryBuilder.executeTracesInsert(traces);
          await this.queryBuilder.executeObservationsInsert(observations);
          await this.queryBuilder.executeDatasetRunItemsInsert(datasetRunItems);
          await this.queryBuilder.executeScoresInsert(scores);
        } catch (error) {
          logger.error(`✗ Insert failed:`, error);
          throw error;
        }
      }
    }
  }

  /**
   * Creates evaluation data for testing evaluator configurations.
   * Use for: Evaluator development, score validation, evaluation testing.
   */
  async createEvaluationData(projectIds: string[]): Promise<void> {
    logger.info(`Creating evaluation data for ${projectIds.length} projects.`);

    for (const projectId of projectIds) {
      logger.info(`Processing evaluation data for project ${projectId}`);

      const evalTracesPerProject = EVAL_TRACE_COUNT;
      const evalObservationsPerTrace = 10;

      // Generate evaluation traces
      const traces = this.dataGenerator.generateEvaluationTraces(
        projectId,
        evalTracesPerProject,
      );

      // Generate evaluation observations
      const observations = this.dataGenerator.generateEvaluationObservations(
        traces,
        evalObservationsPerTrace,
        projectId,
      );

      // Generate scores - exactly one score per evaluation trace
      const scores = this.dataGenerator.generateEvaluationScores(
        traces,
        observations,
        projectId,
      );

      await this.queryBuilder.executeTracesInsert(traces);
      await this.queryBuilder.executeObservationsInsert(observations);
      await this.queryBuilder.executeScoresInsert(scores);
    }
  }

  /**
   * Creates large-scale synthetic data for performance testing and demos.
   * Use for: Load testing, dashboard demos, realistic usage simulation.
   */
  async createSyntheticData(
    projectIds: string[],
    opts: SeederOptions,
  ): Promise<void> {
    const totalObservations = getTotalObservationsForMode(opts.mode);

    logger.info(
      `Creating synthetic data (mode: ${opts.mode}, observations: ${totalObservations}) for ${projectIds.length} projects.`,
    );

    for (const projectId of projectIds) {
      logger.info(`Processing synthetic data for project ${projectId}`);

      const observationsPerTrace = 15;
      const tracesPerProject = Math.floor(
        totalObservations / observationsPerTrace,
      );
      const scoresPerTrace = 10;

      if (opts.mode === "bulk") {
        logger.info(`Using bulk generation for ${tracesPerProject} traces`);

        const traceQuery = this.queryBuilder.buildBulkTracesInsert(
          projectId,
          tracesPerProject,
          "default",
          this.fileContent || undefined,
          { numberOfDays: opts.numberOfDays },
        );

        const observationQuery = this.queryBuilder.buildBulkObservationsInsert(
          projectId,
          tracesPerProject,
          observationsPerTrace,
          "default",
          this.fileContent || undefined,
          { numberOfDays: opts.numberOfDays },
        );
        const scoreQuery = this.queryBuilder.buildBulkScoresInsert(
          projectId,
          tracesPerProject,
          scoresPerTrace,
          "default",
          { numberOfDays: opts.numberOfDays },
        );

        await this.executeQuery(traceQuery);
        await this.executeQuery(observationQuery);
        await this.executeQuery(scoreQuery);
      } else {
        // Use detailed generation for smaller datasets
        const traces = this.dataGenerator.generateSyntheticTraces(
          projectId,
          tracesPerProject,
        );
        const observations = this.dataGenerator.generateSyntheticObservations(
          traces,
          observationsPerTrace,
        );
        const scores = this.dataGenerator.generateSyntheticScores(
          traces,
          observations,
          scoresPerTrace,
        );

        await this.queryBuilder.executeTracesInsert(traces);
        await this.queryBuilder.executeObservationsInsert(observations);
        await this.queryBuilder.executeScoresInsert(scores);
      }
    }
  }

  /**
   * Executes complete seeding: datasets + evaluation + synthetic data.
   * Use for: Full system setup, comprehensive testing, complete data reset.
   */
  async executeFullSeed(
    projectIds: string[],
    opts: SeederOptions,
  ): Promise<void> {
    logger.info("Starting full seed process");

    try {
      // Create dataset experiment data
      await this.createDatasetExperimentData(projectIds, opts);

      // Create evaluation data
      await this.createEvaluationData(projectIds);

      // Create synthetic data
      await this.createSyntheticData(projectIds, opts);

      // Create traces for a realistic chat session
      await this.createSupportChatSessionTraces(projectIds);

      // create traces from real examples for each framework source
      await this.createFrameworkTraces(projectIds);

      // Create traces for media attachment testing
      await this.createMediaTestTraces(projectIds);

      // Log completion statistics (commented out to reduce terminal noise)
      await this.logStatistics();

      logger.info("Full seed process completed successfully");
    } catch (error) {
      logger.error("Seed process failed:", error);
      throw error;
    }
  }

  private async executeQuery(query: string): Promise<void> {
    try {
      await clickhouseClient().command({
        query,
        clickhouse_settings: {
          wait_end_of_query: 1,
        },
      });
    } catch (error) {
      logger.error("Query execution failed:", error);
      logger.error("Failed query:", query);
      throw error;
    }
  }

  private async logStatistics(): Promise<void> {
    const tables = ["traces", "scores", "observations"];

    for (const table of tables) {
      try {
        const query = `
          SELECT
            project_id,
            count() AS per_project_count,
            bar(per_project_count, 0, (
              SELECT count(*)
              FROM ${table}
            ), 50) AS bar_representation
          FROM ${table}
          GROUP BY project_id
          ORDER BY count() desc
        `;

        const result = await clickhouseClient().query({
          query,
          format: "TabSeparated",
        });

        logger.info(
          `${table.charAt(0).toUpperCase() + table.slice(1)} per Project: \n` +
            (await result.text()),
        );
      } catch (error) {
        logger.warn(`Could not log statistics for ${table}:`, error);
      }
    }
  }

  async createSupportChatSessionTraces(projectIds: string[]): Promise<void> {
    logger.info(
      `Creating support chat session data for ${projectIds.length} projects.`,
    );

    for (const projectId of projectIds) {
      logger.info(`Processing support chat session for project ${projectId}`);

      // Generate data using the data generator
      const { traces, observations, scores } =
        this.dataGenerator.generateSupportChatSessionData(projectId);

      try {
        await this.queryBuilder.executeTracesInsert(traces);
        await this.queryBuilder.executeObservationsInsert(observations);
        await this.queryBuilder.executeScoresInsert(scores);
      } catch (error) {
        logger.error(`✗ Support chat session insert failed:`, error);
        throw error;
      }
    }
  }

  // create traces from real examples for each framework source
  // useful for testing rendering
  async createFrameworkTraces(projectIds: string[]): Promise<void> {
    logger.info(`Creating framework traces for ${projectIds.length} projects.`);

    const loader = new FrameworkTraceLoader();

    for (const projectId of projectIds) {
      logger.info(`Processing framework traces for project ${projectId}`);

      const { traces, observations, scores } =
        loader.loadTracesForProject(projectId);

      try {
        if (traces.length > 0) {
          await this.queryBuilder.executeTracesInsert(traces);
        }
        if (observations.length > 0) {
          await this.queryBuilder.executeObservationsInsert(observations);
        }
        if (scores.length > 0) {
          await this.queryBuilder.executeScoresInsert(scores);
        }
      } catch (error) {
        logger.error(`✗ Framework traces insert failed:`, error);
        throw error;
      }
    }
  }

  /**
   * Creates test traces for media attachment testing (JSON Beta view).
   * Use for: Testing media rendering in the trace detail view.
   */
  async createMediaTestTraces(projectIds: string[]): Promise<void> {
    logger.info(
      `Creating media test traces for ${projectIds.length} projects.`,
    );

    const now = Date.now();
    const imageFixture = getSeedMediaFixture("image");
    const pdfFixture = getSeedMediaFixture("pdf");
    const audioFixture = getSeedMediaFixture("audio");

    const getMediaMetadata = (
      field: "input" | "output" | "metadata",
      fixture: ReturnType<typeof getSeedMediaFixture>,
    ): Record<string, string> =>
      fixture
        ? {
            [`${field}_media_id`]: fixture.mediaId,
            [`${field}_media_content_type`]: fixture.contentType,
            [`${field}_media_reference_string`]: fixture.referenceString,
          }
        : {
            [`${field}_media_status`]: "missing-seed-media-fixture",
          };

    for (const projectId of projectIds) {
      logger.info(`Processing media test traces for project ${projectId}`);

      const traces: TraceRecordInsertType[] = [
        // Trace 1: Image only (in input)
        createTrace({
          id: MEDIA_TEST_TRACE_IDS.imageOnly,
          project_id: projectId,
          name: "Media Test: Image Only",
          timestamp: now,
          input: JSON.stringify([
            {
              role: "user",
              content: imageFixture
                ? [
                    {
                      type: "text",
                      text: "Please analyze the seeded image attachment.",
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: imageFixture.referenceString,
                      },
                    },
                  ]
                : "Please analyze the seeded image attachment. The media fixture is missing.",
            },
          ]),
          output: JSON.stringify([
            {
              role: "assistant",
              content:
                "This trace is meant to render one inline seeded image in the input and expose its metadata on the trace.",
            },
          ]),
          metadata: {
            test_type: "media",
            media_types: "image",
            render_mode: "chatml-inline-image",
            ...getMediaMetadata("input", imageFixture),
          },
          tags: ["media-test", "image"],
          environment: "default",
        }),
        // Trace 2: All media types
        createTrace({
          id: MEDIA_TEST_TRACE_IDS.allTypes,
          project_id: projectId,
          name: "Media Test: All Types",
          timestamp: now + 1000,
          input: JSON.stringify({
            message: "This trace has an image attachment in input",
            description: "Testing trace-level input attachment metadata",
            attachment: imageFixture
              ? {
                  mediaId: imageFixture.mediaId,
                  contentType: imageFixture.contentType,
                  referenceString: imageFixture.referenceString,
                }
              : "seed media fixture missing",
          }),
          output: JSON.stringify({
            message: "This trace has a PDF attachment in output",
            description: "Testing trace-level output attachment metadata",
            attachment: pdfFixture
              ? {
                  mediaId: pdfFixture.mediaId,
                  contentType: pdfFixture.contentType,
                  referenceString: pdfFixture.referenceString,
                }
              : "seed media fixture missing",
          }),
          metadata: {
            message: "This trace has an audio attachment in metadata",
            description: "Testing trace-level metadata attachment metadata",
            test_type: "media",
            media_types: "image,pdf,audio",
            render_mode: "json-with-attachment-metadata",
            ...getMediaMetadata("input", imageFixture),
            ...getMediaMetadata("output", pdfFixture),
            ...getMediaMetadata("metadata", audioFixture),
          },
          tags: ["media-test", "all-types"],
          environment: "default",
        }),
        // Trace 3: All media types with ChatML format (pretty-rendered)
        createTrace({
          id: MEDIA_TEST_TRACE_IDS.allTypesChatML,
          project_id: projectId,
          name: "Media Test: All Types (ChatML)",
          timestamp: now + 2000,
          input: JSON.stringify([
            {
              role: "system",
              content:
                "You are a helpful assistant that can analyze images, documents, and audio files.",
            },
            {
              role: "user",
              content: imageFixture
                ? [
                    {
                      type: "text",
                      text: "Please analyze the attached seeded image and describe what you see.",
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: imageFixture.referenceString,
                      },
                    },
                  ]
                : "Please analyze the attached seeded image and describe what you see. The media fixture is missing.",
            },
          ]),
          output: JSON.stringify([
            {
              role: "assistant",
              content:
                "I can see the Langfuse logo in the image. The trace also includes a PDF attachment on the output field and an audio attachment on the metadata field. Check the trace metadata for the deterministic media IDs and reference strings.",
            },
          ]),
          metadata: {
            message:
              "This trace has audio in metadata and explicit media metadata for every field",
            description:
              "Testing ChatML media rendering with deterministic media references",
            test_type: "media",
            media_types: "image,pdf,audio",
            format: "chatml",
            render_mode: "chatml-inline-image-plus-trace-metadata",
            ...getMediaMetadata("input", imageFixture),
            ...getMediaMetadata("output", pdfFixture),
            ...getMediaMetadata("metadata", audioFixture),
          },
          tags: ["media-test", "all-types", "chatml"],
          environment: "default",
        }),
      ];

      try {
        await this.queryBuilder.executeTracesInsert(traces);
        logger.info(
          `✓ Created ${traces.length} media test traces for project ${projectId}`,
        );
      } catch (error) {
        logger.error(`✗ Media test traces insert failed:`, error);
        throw error;
      }
    }
  }
}
