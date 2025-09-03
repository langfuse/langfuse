import { FileContent, SeederOptions } from "./types";
import { DataGenerator } from "./data-generators";
import { ClickHouseQueryBuilder } from "./clickhouse-builder";
import { EVAL_TRACE_COUNT, SEED_DATASETS } from "./postgres-seed-constants";
import {
  clickhouseClient,
  DatasetRunItemRecordInsertType,
  logger,
  ObservationRecordInsertType,
  TraceRecordInsertType,
  ScoreRecordInsertType,
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
        const now = Date.now();

        const traces: TraceRecordInsertType[] = [];
        const observations: ObservationRecordInsertType[] = [];
        const datasetRunItems: DatasetRunItemRecordInsertType[] = [];

        for (const seedDataset of SEED_DATASETS) {
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

            traces.push(trace);
            observations.push(observation);
            datasetRunItems.push(datasetRunItem);
          }
        }

        try {
          await this.queryBuilder.executeTracesInsert(traces);
          await this.queryBuilder.executeObservationsInsert(observations);
          await this.queryBuilder.executeDatasetRunItemsInsert(datasetRunItems);
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

      // Create support chaat session with multiple traces
      await this.createSupportChatSessionTraces(projectIds);

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
    // Domain: Art museum membership support (non-tech)
    const dialogues = [
      {
        user: "Hi—my family membership at the City Art Museum was charged twice this month.",
        assistant:
          "Sorry about that. I can help. Could you share your membership ID and the last 4 digits of the card?",
      },
      {
        user: "Membership ID is CAM-48291, card ending 4417.",
        assistant: "Thanks. I’ll check your billing records now.",
        tool: {
          name: "billing.lookup",
          input: { membershipId: "CAM-48291", last4: "4417" },
          output: {
            duplicateCharge: true,
            amounts: [95.0, 95.0],
            date: "2025-08-28",
          },
        },
      },
      {
        user: "Okay.",
        assistant:
          "I found a duplicate charge on 2025-08-28 for $95. I can issue a refund to the original payment method. Shall I proceed?",
      },
      {
        user: "Yes, please issue the refund.",
        assistant: "Processing your refund now. One moment.",
        tool: {
          name: "billing.refund",
          input: { membershipId: "CAM-48291", amount: 95.0 },
          output: { status: "success", refundId: "RFND-20931" },
        },
      },
      {
        user: "Thank you!",
        assistant:
          "Refund RFND-20931 has been issued. You’ll see it on your statement within 3–5 business days.",
      },
      {
        user: "No, that’s all. Appreciate the quick help!",
        assistant: "Happy to help. Enjoy your next visit to the museum!",
      },
      // a couple more lightweight turns for scrolling realism
      {
        user: "Oh, and do members get early access to exhibitions?",
        assistant:
          "Yes—members get a 48-hour early booking window and a preview evening invite.",
      },
      {
        user: "Perfect.",
        assistant: "You’re all set. Have a great day!",
      },
    ];

    for (const projectId of projectIds) {
      const now = Date.now();
      const traces: TraceRecordInsertType[] = dialogues.map((d, index) => ({
        id: `support-chat-${index}-${projectId.slice(-8)}`,
        timestamp: now + index * 1000,
        name: "SupportChatSession",
        user_id: null,
        metadata: { scenario: "support-chat" },
        release: null,
        version: null,
        project_id: projectId,
        environment: "default",
        public: false,
        bookmarked: false,
        tags: ["support", "chat", "session"],
        input: JSON.stringify(
          d.tool
            ? {
                messages: [
                  { role: "user", content: d.user },
                  { role: "assistant", content: d.assistant },
                  {
                    role: "tool",
                    name: d.tool.name,
                    content: d.tool.output,
                  },
                ],
              }
            : { messages: [{ role: "user", content: d.user }] },
        ),
        output: JSON.stringify({ role: "assistant", content: d.assistant }),
        session_id: "support-chat-session",
        created_at: now + index * 1000,
        updated_at: now + index * 1000 + 500,
        event_ts: now + index * 1000,
        is_deleted: 0,
      }));

      await this.queryBuilder.executeTracesInsert(traces);

      // Create one GENERATION observation per trace
      const observations: ObservationRecordInsertType[] = dialogues.map(
        (d, index) => {
          const start = now + index * 1000 + 50;
          const end = start + 400 + Math.floor(Math.random() * 400);
          const inputTokens = 80 + Math.floor(Math.random() * 60);
          const outputTokens = 60 + Math.floor(Math.random() * 60);
          const totalTokens = inputTokens + outputTokens;

          const baseGen: ObservationRecordInsertType = {
            id: `support-chat-${index}-${projectId.slice(-8)}-gen`,
            trace_id: `support-chat-${index}-${projectId.slice(-8)}`,
            project_id: projectId,
            type: "GENERATION",
            parent_observation_id: null,
            environment: "default",
            start_time: start,
            end_time: end,
            name: "llm-generation",
            metadata: {},
            level: "DEFAULT",
            status_message: null,
            version: null,
            input: JSON.stringify({
              messages: [
                { role: "user", content: d.user },
                d.tool
                  ? {
                      role: "tool",
                      name: d.tool.name,
                      content: d.tool.output,
                    }
                  : undefined,
              ].filter(Boolean),
            }),
            output: JSON.stringify({ role: "assistant", content: d.assistant }),
            provided_model_name: "gpt-4o",
            internal_model_id: null,
            model_parameters: JSON.stringify({ temperature: 0.2 }),
            provided_usage_details: {
              input: inputTokens,
              output: outputTokens,
              total: totalTokens,
            },
            usage_details: {
              input: inputTokens,
              output: outputTokens,
              total: totalTokens,
            },
            provided_cost_details: {
              input: Math.round(inputTokens * 2) / 1_000_000,
              output: Math.round(outputTokens * 3) / 1_000_000,
              total: Math.round(totalTokens * 5) / 1_000_000,
            },
            cost_details: {
              input: Math.round(inputTokens * 2) / 1_000_000,
              output: Math.round(outputTokens * 3) / 1_000_000,
              total: Math.round(totalTokens * 5) / 1_000_000,
            },
            total_cost: Math.round(totalTokens * 5) / 1_000_000,
            completion_start_time: start + 120,
            prompt_id: null,
            prompt_name: null,
            prompt_version: null,
            created_at: start,
            updated_at: end,
            event_ts: start,
            is_deleted: 0,
          };

          if (!d.tool) return baseGen;

          const toolObs: ObservationRecordInsertType = {
            id: `support-chat-${index}-${projectId.slice(-8)}-tool`,
            trace_id: `support-chat-${index}-${projectId.slice(-8)}`,
            project_id: projectId,
            type: "TOOL",
            parent_observation_id: null,
            environment: "default",
            start_time: start - 40,
            end_time: start - 5,
            name: d.tool.name,
            metadata: {},
            level: "DEFAULT",
            status_message: null,
            version: null,
            input: JSON.stringify(d.tool.input),
            output: JSON.stringify(d.tool.output),
            provided_model_name: null,
            internal_model_id: null,
            model_parameters: null,
            provided_usage_details: {},
            usage_details: {},
            provided_cost_details: {},
            cost_details: {},
            total_cost: null,
            completion_start_time: null,
            prompt_id: null,
            prompt_name: null,
            prompt_version: null,
            created_at: start - 40,
            updated_at: start - 5,
            event_ts: start - 40,
            is_deleted: 0,
          };

          return [toolObs, baseGen] as unknown as ObservationRecordInsertType;
        },
      );

      // Create a couple of scores per trace
      const scores: ScoreRecordInsertType[] = dialogues
        .map((_, index) => {
          const baseTs = now + index * 1000 + 600;
          const helpfulness: ScoreRecordInsertType = {
            id: `support-chat-${index}-${projectId.slice(-8)}-score-helpfulness`,
            project_id: projectId,
            trace_id: `support-chat-${index}-${projectId.slice(-8)}`,
            session_id: null,
            dataset_run_id: null,
            observation_id: null,
            environment: "default",
            name: "helpfulness",
            value: 70 + Math.random() * 25,
            source: "API",
            comment: "Heuristic helpfulness score",
            metadata: {},
            author_user_id: null,
            config_id: null,
            data_type: "NUMERIC",
            string_value: null,
            queue_id: null,
            created_at: baseTs,
            updated_at: baseTs,
            timestamp: baseTs,
            event_ts: baseTs,
            is_deleted: 0,
          };

          const safeVal = Math.random() > 0.1 ? 1 : 0;
          const safety: ScoreRecordInsertType = {
            id: `support-chat-${index}-${projectId.slice(-8)}-score-safety`,
            project_id: projectId,
            trace_id: `support-chat-${index}-${projectId.slice(-8)}`,
            session_id: null,
            dataset_run_id: null,
            observation_id: null,
            environment: "default",
            name: "safe",
            value: safeVal,
            source: "API",
            comment: "Content safety",
            metadata: {},
            author_user_id: null,
            config_id: null,
            data_type: "BOOLEAN",
            string_value: safeVal === 1 ? "true" : "false",
            queue_id: null,
            created_at: baseTs + 10,
            updated_at: baseTs + 10,
            timestamp: baseTs + 10,
            event_ts: baseTs + 10,
            is_deleted: 0,
          };

          // Optional: resolution score on last turn
          const isFinal = index === dialogues.length - 1;
          const resolved: ScoreRecordInsertType | null = isFinal
            ? {
                id: `support-chat-${index}-${projectId.slice(-8)}-score-resolved`,
                project_id: projectId,
                trace_id: `support-chat-${index}-${projectId.slice(-8)}`,
                session_id: null,
                dataset_run_id: null,
                observation_id: null,
                environment: "default",
                name: "resolved",
                value: 1,
                source: "API",
                comment: "Conversation resolved",
                metadata: {},
                author_user_id: null,
                config_id: null,
                data_type: "BOOLEAN",
                string_value: "true",
                queue_id: null,
                created_at: baseTs + 20,
                updated_at: baseTs + 20,
                timestamp: baseTs + 20,
                event_ts: baseTs + 20,
                is_deleted: 0,
              }
            : null;

          return [helpfulness, safety, resolved].filter(
            Boolean,
          ) as ScoreRecordInsertType[];
        })
        .flat();

      // Flatten observations because some steps have tool+generation
      const flattenedObservations = observations.flatMap((o) =>
        Array.isArray(o)
          ? (o as unknown as ObservationRecordInsertType[])
          : [o],
      );

      await this.queryBuilder.executeObservationsInsert(flattenedObservations);
      await this.queryBuilder.executeScoresInsert(scores);
    }
  }
}
