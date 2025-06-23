import { FileContent, SeederOptions } from "./types";
import { DataGenerator } from "./data-generators";
import { ClickHouseQueryBuilder } from "./clickhouse-builder";
import { EVAL_TRACE_COUNT, SEED_DATASETS } from "./postgres-seed-constants";
import {
  clickhouseClient,
  logger,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import path from "path";
import { readFileSync } from "fs";

/**
 * Orchestrates seeding operations across ClickHouse and PostgreSQL.
 *
 * Use createXxxData() for specific data types:
 * - createDatasetExperimentData(): Dataset runs in langfuse-prompt-experiments env
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

        const traces: TraceRecordInsertType[] = [];
        const observations: ObservationRecordInsertType[] = [];

        for (const seedDataset of SEED_DATASETS) {
          for (const [itemIndex, datasetItem] of seedDataset.items.entries()) {
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

            traces.push(trace);
            observations.push(observation);
          }
        }

        try {
          await this.queryBuilder.executeTracesInsert(traces);
          await this.queryBuilder.executeObservationsInsert(observations);
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
    logger.info(`Creating synthetic data for ${projectIds.length} projects.`);

    for (const projectId of projectIds) {
      logger.info(`Processing synthetic data for project ${projectId}`);

      const observationsPerTrace = 15;
      const tracesPerProject = Math.floor(
        (opts.totalObservations || 1000) / observationsPerTrace,
      );
      const scoresPerTrace = 10;

      // For large datasets, use bulk generation for better performance
      if (tracesPerProject > 100) {
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
}
