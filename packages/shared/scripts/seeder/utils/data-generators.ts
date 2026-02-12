import { FileContent, DatasetItemInput } from "./types";
import {
  REALISTIC_TRACE_NAMES,
  REALISTIC_SPAN_NAMES,
  REALISTIC_GENERATION_NAMES,
  REALISTIC_MODELS,
  REALISTIC_AGENT_NAMES,
  REALISTIC_TOOL_NAMES,
  REALISTIC_CHAIN_NAMES,
  REALISTIC_RETRIEVER_NAMES,
  REALISTIC_EVALUATOR_NAMES,
  REALISTIC_EMBEDDING_NAMES,
  REALISTIC_GUARDRAIL_NAMES,
} from "./clickhouse-seed-constants";
import {
  generateDatasetItemId,
  generateDatasetRunItemId,
  generateDatasetRunTraceId,
  generateEvalObservationId,
  generateEvalScoreId,
  generateEvalTraceId,
} from "./seed-helpers";
import { v4 as uuidv4 } from "uuid";
import {
  FAILED_EVAL_TRACE_INTERVAL,
  SEED_EVALUATOR_CONFIGS,
} from "./postgres-seed-constants";
import {
  createTrace,
  createObservation,
  createTraceScore,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
  DatasetRunItemRecordInsertType,
  createDatasetRunItem,
  createDatasetRunScore,
} from "../../../src/server";

/**
 * Generates realistic test data for traces, observations, and scores.
 *
 * Use generateXxxTraces() for creating different data types:
 * - generateDatasetTrace(): For dataset experiment runs (langfuse-prompt-experiment env)
 * - generateEvaluationTraces(): For evaluation data (langfuse-evaluation env)
 * - generateSyntheticTraces(): For large-scale synthetic data (default env)
 */
export class DataGenerator {
  private static instance: DataGenerator;
  private fileContent: FileContent | null = null;

  static getInstance(): DataGenerator {
    if (!DataGenerator.instance) {
      DataGenerator.instance = new DataGenerator();
    }
    return DataGenerator.instance;
  }

  setFileContent(content: FileContent) {
    this.fileContent = content;
  }

  private randomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private randomBoolean(probability: number = 0.5): boolean {
    return Math.random() < probability;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Creates dataset run items for dataset runs.
   * Use for: Dataset experiment scenarios.
   */
  generateDatasetRunItem(
    input: DatasetItemInput & { runCreatedAt: number },
    projectId: string,
  ): DatasetRunItemRecordInsertType {
    const datasetRunItemId = generateDatasetRunItemId(
      input.datasetName,
      input.itemIndex,
      projectId,
      input.runNumber || 0,
    );

    return createDatasetRunItem({
      id: datasetRunItemId,
      project_id: projectId,
      trace_id: generateDatasetRunTraceId(
        input.datasetName,
        input.itemIndex,
        projectId,
        input.runNumber || 0,
      ),
      dataset_id: `${input.datasetName}-${projectId.slice(-8)}`,
      dataset_run_id: `demo-dataset-run-${input.runNumber}-${input.datasetName}-${projectId.slice(-8)}`,
      dataset_run_name: `demo-dataset-run-${input.runNumber}-${input.datasetName}`,
      dataset_run_created_at: input.runCreatedAt,
      dataset_run_description:
        (input.runNumber || 0) % 2 === 0 ? "Dataset run description" : "",
      dataset_run_metadata: { key: "value" },
      dataset_item_id: generateDatasetItemId(
        input.datasetName,
        input.itemIndex,
        projectId,
      ),
      dataset_item_input: input.item.input,
      dataset_item_expected_output: input.item.expectedOutput,
    });
  }

  /**
   * Creates traces from dataset items for experiment runs.
   * Use for: Dataset experiments scenarios.
   */
  generateDatasetTrace(
    input: DatasetItemInput,
    projectId: string,
  ): TraceRecordInsertType {
    const traceId = generateDatasetRunTraceId(
      input.datasetName,
      input.itemIndex,
      projectId,
      input.runNumber || 0,
    );

    let traceInput: string;
    let traceOutput: string;

    // Transform dataset item based on type
    if (input.datasetName === "demo-countries-dataset") {
      const data = input.item as { input: { country: string }; output: string };
      traceInput = `What is the capital of ${data.input.country}?`;
      traceOutput = `The capital of ${data.input.country} is ${data.output}.`;
    } else if (input.datasetName === "demo-english-transcription-dataset") {
      const data = input.item as { input: { word: string }; output: string };
      traceInput = `What is the IPA transcription of the word "${data.input.word}"?`;
      traceOutput = `The IPA transcription of "${data.input.word}" is ${data.output}.`;
    } else {
      traceInput = JSON.stringify(input.item.input);
      traceOutput = JSON.stringify(input.item.output);
    }

    return createTrace({
      id: traceId,
      project_id: projectId,
      name: `dataset-run-item-${uuidv4()}`,
      input: traceInput,
      output: traceOutput,
      environment: "langfuse-prompt-experiment",
      metadata: { experimentType: "langfuse-prompt-experiment" },
      public: false,
      bookmarked: false,
      session_id: null,
      tags: [],
    });
  }

  /**
   * Creates observations for dataset experiment traces with variable costs/latency.
   * Use for: Dataset experiments requiring detailed observation tracking.
   */
  generateDatasetObservation(
    trace: TraceRecordInsertType,
    input: DatasetItemInput,
    projectId: string,
  ): ObservationRecordInsertType {
    const observationId = `observation-dataset-${input.datasetName}-${input.itemIndex}-${input.runNumber}-${projectId.slice(-8)}`;

    // Generate variable usage and cost for each observation
    const inputTokens = this.randomInt(30, 150);
    const outputTokens = this.randomInt(10, 80);
    const totalTokens = inputTokens + outputTokens;

    // Cost should be fraction of cents (0.0001-0.01 range)
    const inputCost = (inputTokens * this.randomInt(1, 5)) / 1000000; // $0.000001-0.000005 per token
    const outputCost = (outputTokens * this.randomInt(2, 10)) / 1000000; // $0.000002-0.00001 per token
    const totalCost = inputCost + outputCost;

    return createObservation({
      id: observationId,
      trace_id: trace.id,
      project_id: projectId,
      type: "GENERATION",
      name: `dataset-generation-${input.itemIndex}-run-${input.runNumber}`,
      input: trace.input,
      output: trace.output,
      provided_model_name: "gpt-3.5-turbo",
      model_parameters: JSON.stringify({ temperature: 0.7 }),
      usage_details: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      provided_usage_details: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      cost_details: {
        input: Math.round(inputCost * 100000) / 100000, // Round to 5 decimal places
        output: Math.round(outputCost * 100000) / 100000,
        total: Math.round(totalCost * 100000) / 100000,
      },
      provided_cost_details: {
        input: Math.round(inputCost * 100000) / 100000,
        output: Math.round(outputCost * 100000) / 100000,
        total: Math.round(totalCost * 100000) / 100000,
      },
      total_cost: Math.round(totalCost * 100000) / 100000,
      environment: "langfuse-prompt-experiment",
    });
  }

  /**
   * Creates scores for dataset experiment scores with variable values.
   * Use for: Dataset experiments requiring detailed score tracking.
   */
  generateDatasetScore(
    trace: TraceRecordInsertType,
    input: DatasetItemInput,
    projectId: string,
    scoreNames: string[],
  ): ScoreRecordInsertType {
    const scoreId = `score-dataset-${input.datasetName}-${input.itemIndex}-${input.runNumber}-${projectId.slice(-8)}`;

    return createTraceScore({
      id: scoreId,
      trace_id: trace.id,
      project_id: projectId,
      name: this.randomElement(scoreNames),
      value: Math.random() * 100,
      string_value: undefined,
      data_type: "NUMERIC",
      source: "API",
      environment: "langfuse-prompt-experiment",
    });
  }

  /**
   * Creates scores for dataset experiment traces with variable values.
   * Use for: Dataset experiments requiring detailed score tracking.
   */
  generateDatasetRunScore(
    runId: string,
    input: {
      datasetName: string;
      runNumber: number;
    },
    projectId: string,
    scoreNames: string[],
  ): ScoreRecordInsertType {
    const scoreId = `score-dataset-run-${input.datasetName}-${input.runNumber}-${projectId.slice(-8)}`;

    return createDatasetRunScore({
      id: scoreId,
      project_id: projectId,
      dataset_run_id: runId,
      name: this.randomElement(scoreNames),
      value: Math.random() * 100,
      string_value: undefined,
      data_type: "NUMERIC",
      source: "API",
      environment: "langfuse-prompt-experiment",
    });
  }

  /**
   * Creates large-scale synthetic traces for performance testing.
   * Use for: Load testing, dashboard demos, realistic usage simulation.
   */
  generateSyntheticTraces(
    projectId: string,
    count: number,
  ): TraceRecordInsertType[] {
    const traces: TraceRecordInsertType[] = [];

    for (let i = 0; i < count; i++) {
      const trace = createTrace({
        id: `trace-synthetic-${i}-${projectId.slice(-8)}`,
        project_id: projectId,
        name: this.randomElement(REALISTIC_TRACE_NAMES),
        input: this.generateTraceInput(),
        output: this.generateTraceOutput(),
        user_id: this.randomBoolean(0.3)
          ? `user_${this.randomInt(1, 1000)}`
          : null,
        session_id: this.randomBoolean(0.3)
          ? `session_${this.randomInt(1, 100)}`
          : undefined,
        environment: "default",
        metadata: { generated: "synthetic" },
        tags: this.randomBoolean(0.3) ? ["production", "ai-agent"] : [],
        public: this.randomBoolean(0.8),
        bookmarked: this.randomBoolean(0.1),
        release: this.randomBoolean(0.4)
          ? `v${this.randomInt(1, 5)}.${this.randomInt(0, 10)}`
          : undefined,
        version: this.randomBoolean(0.4)
          ? `v${this.randomInt(1, 3)}.${this.randomInt(0, 20)}`
          : undefined,
      });

      traces.push(trace);
    }

    return traces;
  }

  generateEvaluationObservations(
    traces: TraceRecordInsertType[],
    observationsPerTrace: number = 5,
    projectId: string,
  ): ObservationRecordInsertType[] {
    const observations: ObservationRecordInsertType[] = [];

    for (const evalJobConfiguration of SEED_EVALUATOR_CONFIGS) {
      traces.forEach((trace, traceIndex) => {
        for (let i = 0; i < observationsPerTrace; i++) {
          const obsType = this.randomBoolean(0.47)
            ? "GENERATION"
            : this.randomBoolean(0.94)
              ? "SPAN"
              : "EVENT";

          const observation: ObservationRecordInsertType = createObservation({
            id: generateEvalObservationId(
              evalJobConfiguration.evalTemplateId,
              traceIndex,
              projectId,
            ),
            trace_id: trace.id,
            project_id: projectId,
            parent_observation_id: undefined,
            type: obsType,
            name:
              obsType === "GENERATION"
                ? this.randomElement(REALISTIC_GENERATION_NAMES)
                : obsType === "SPAN"
                  ? this.randomElement(REALISTIC_SPAN_NAMES)
                  : `event_${i % 10}`,
            level: this.randomBoolean(0.85)
              ? "DEFAULT"
              : this.randomBoolean(0.7)
                ? "DEBUG"
                : this.randomBoolean(0.3)
                  ? "ERROR"
                  : "WARNING",
            input:
              obsType === "GENERATION"
                ? this.randomBoolean(0.4)
                  ? this.fileContent?.heavyMarkdown || "Sample input"
                  : JSON.stringify(this.fileContent?.chatMlJson || {})
                : undefined,
            output:
              obsType === "GENERATION"
                ? this.randomBoolean(0.3)
                  ? JSON.stringify(this.fileContent?.nestedJson || {})
                  : JSON.stringify(this.fileContent?.chatMlJson || {})
                : undefined,
            provided_model_name:
              obsType === "GENERATION"
                ? this.randomElement(REALISTIC_MODELS)
                : undefined,
            model_parameters:
              obsType === "GENERATION"
                ? JSON.stringify({ temperature: 0.7 })
                : undefined,
            usage_details:
              obsType === "GENERATION"
                ? {
                    input: this.randomInt(20, 200),
                    output: this.randomInt(10, 100),
                    total: this.randomInt(30, 300),
                  }
                : undefined,
            provided_usage_details:
              obsType === "GENERATION"
                ? {
                    input: this.randomInt(20, 200),
                    output: this.randomInt(10, 100),
                    total: this.randomInt(30, 300),
                  }
                : undefined,
            cost_details:
              obsType === "GENERATION"
                ? {
                    input: this.randomInt(1, 10) / 100000,
                    output: this.randomInt(1, 20) / 100000,
                    total: this.randomInt(2, 30) / 100000,
                  }
                : undefined,
            provided_cost_details:
              obsType === "GENERATION"
                ? {
                    input: this.randomInt(1, 10) / 100000,
                    output: this.randomInt(1, 20) / 100000,
                    total: this.randomInt(2, 30) / 100000,
                  }
                : undefined,
            environment: "langfuse-evaluation",
          });

          observations.push(observation);
        }
      });
    }

    return observations;
  }

  /**
   * Creates synthetic observations with automatic prompt linking (5% rate).
   * Use for: Large datasets, hierarchical observation structures, cost variation.
   */
  generateSyntheticObservations(
    traces: TraceRecordInsertType[],
    observationsPerTrace: number = 5,
  ): ObservationRecordInsertType[] {
    const observations: ObservationRecordInsertType[] = [];

    traces.forEach((trace, traceIndex) => {
      if (this.randomBoolean(0.1)) {
        const { observations: workflowObservations } =
          this.generateComprehensiveAIWorkflowTrace(trace.id, trace.project_id);
        observations.push(...workflowObservations);
        return;
      }

      for (let i = 0; i < observationsPerTrace; i++) {
        const obsType = this.randomBoolean(0.8) // More "traditional" types, are more common in app
          ? this.randomElement(["GENERATION", "SPAN", "EVENT"])
          : this.randomElement([
              "AGENT",
              "TOOL",
              "CHAIN",
              "RETRIEVER",
              "EVALUATOR",
              "EMBEDDING",
              "GUARDRAIL",
            ]);

        let observationName: string;
        switch (obsType) {
          case "AGENT":
            observationName = this.randomElement(REALISTIC_AGENT_NAMES);
            break;
          case "TOOL":
            observationName = this.randomElement(REALISTIC_TOOL_NAMES);
            break;
          case "CHAIN":
            observationName = this.randomElement(REALISTIC_CHAIN_NAMES);
            break;
          case "RETRIEVER":
            observationName = this.randomElement(REALISTIC_RETRIEVER_NAMES);
            break;
          case "EVALUATOR":
            observationName = this.randomElement(REALISTIC_EVALUATOR_NAMES);
            break;
          case "EMBEDDING":
            observationName = this.randomElement(REALISTIC_EMBEDDING_NAMES);
            break;
          case "GUARDRAIL":
            observationName = this.randomElement(REALISTIC_GUARDRAIL_NAMES);
            break;
          case "GENERATION":
            observationName = this.randomElement(REALISTIC_GENERATION_NAMES);
            break;
          default:
            observationName = this.randomElement(REALISTIC_SPAN_NAMES);
            break;
        }

        const observation: ObservationRecordInsertType = createObservation({
          id: `obs-synthetic-${traceIndex}-${i}`,
          trace_id: trace.id,
          project_id: trace.project_id,
          parent_observation_id:
            i > 0 ? `obs-synthetic-${traceIndex}-${i - 1}` : undefined,
          type: obsType as any,
          name: observationName,
          input:
            obsType === "GENERATION" || obsType === "EMBEDDING"
              ? this.generateObservationInput()
              : undefined,
          output:
            obsType === "GENERATION" ||
            obsType === "RETRIEVER" ||
            obsType === "EVALUATOR" ||
            obsType === "GUARDRAIL"
              ? this.generateObservationOutput()
              : undefined,
          provided_model_name:
            obsType === "GENERATION" || obsType === "EMBEDDING"
              ? this.randomElement(REALISTIC_MODELS)
              : undefined,
          model_parameters:
            obsType === "GENERATION" || obsType === "EMBEDDING"
              ? JSON.stringify({ temperature: 0.7 })
              : undefined,
          usage_details:
            obsType === "GENERATION" || obsType === "EMBEDDING"
              ? {
                  input: this.randomInt(20, 200),
                  output: this.randomInt(10, 100),
                  total: this.randomInt(30, 300),
                }
              : undefined,
          provided_usage_details:
            obsType === "GENERATION" || obsType === "EMBEDDING"
              ? {
                  input: this.randomInt(20, 200),
                  output: this.randomInt(10, 100),
                  total: this.randomInt(30, 300),
                }
              : undefined,
          cost_details:
            obsType === "GENERATION" || obsType === "EMBEDDING"
              ? {
                  input: this.randomInt(1, 10) / 100000,
                  output: this.randomInt(1, 20) / 100000,
                  total: this.randomInt(2, 30) / 100000,
                }
              : undefined,
          provided_cost_details:
            obsType === "GENERATION" || obsType === "EMBEDDING"
              ? {
                  input: this.randomInt(1, 10) / 100000,
                  output: this.randomInt(1, 20) / 100000,
                  total: this.randomInt(2, 30) / 100000,
                }
              : undefined,
          level: this.randomBoolean(0.85)
            ? "DEFAULT"
            : this.randomBoolean(0.7)
              ? "DEBUG"
              : this.randomBoolean(0.5)
                ? "WARNING"
                : "ERROR",
          environment: trace.environment,
        });

        observations.push(observation);
      }
    });

    return observations;
  }

  generateSyntheticScores(
    traces: TraceRecordInsertType[],
    observations: ObservationRecordInsertType[],
    scoresPerTrace: number = 2,
  ): ScoreRecordInsertType[] {
    const scores: ScoreRecordInsertType[] = [];

    traces.forEach((trace, traceIndex) => {
      for (let i = 0; i < scoresPerTrace; i++) {
        const scoreType = this.randomElement([
          "NUMERIC",
          "CATEGORICAL",
          "BOOLEAN",
        ]);

        let value: number | undefined;
        let stringValue: string | undefined;

        switch (scoreType) {
          case "NUMERIC":
            value = Math.random() * 100;
            break;
          case "CATEGORICAL":
            stringValue = `category_${this.randomInt(1, 5)}`;
            break;
          case "BOOLEAN":
            value = this.randomBoolean() ? 1 : 0;
            stringValue = value === 1 ? "true" : "false";
            break;
        }

        const score: ScoreRecordInsertType = createTraceScore({
          id: `score-synthetic-${traceIndex}-${i}`,
          project_id: trace.project_id,
          trace_id: trace.id,
          observation_id: this.randomBoolean(0.1)
            ? this.randomElement(
                observations.filter((o) => o.trace_id === trace.id),
              )?.id
            : undefined,
          name: `metric_${this.randomInt(1, 10)}`,
          value,
          string_value: stringValue,
          data_type: scoreType as any,
          source: "API",
          comment: "Generated score\ntest",
          environment: trace.environment,
        });

        scores.push(score);
      }
    });

    return scores;
  }

  /**
   * Creates a workflow trace with all possible observation types.
   */
  generateComprehensiveAIWorkflowTrace(
    traceId: string,
    projectId: string,
  ): {
    trace: TraceRecordInsertType;
    observations: ObservationRecordInsertType[];
  } {
    // Create the main trace
    const trace = createTrace({
      id: traceId,
      project_id: projectId,
      name: "AI-Agent-Workflow",
      input:
        "Analyze and summarize the latest research papers on quantum computing",
      output:
        "Here is a comprehensive summary of quantum computing research trends with key insights and recommendations.",
      user_id: this.randomBoolean(0.3)
        ? `user_${this.randomInt(1, 1000)}`
        : null,
      session_id: this.randomBoolean(0.3)
        ? `session_${this.randomInt(1, 100)}`
        : undefined,
      environment: "default",
      metadata: { workflowType: "comprehensive-ai", purpose: "demonstration" },
      tags: ["ai-agent", "multi-step", "comprehensive"],
      public: true,
      bookmarked: this.randomBoolean(0.2),
    });

    const observations: ObservationRecordInsertType[] = [];
    const baseTime = Date.now();

    // 1. AGENT - Main coordinator
    observations.push(
      createObservation({
        id: `${traceId}-agent`,
        trace_id: trace.id,
        project_id: projectId,
        type: "AGENT",
        name: this.randomElement(REALISTIC_AGENT_NAMES),
        input: "Plan and coordinate the research analysis workflow",
        output:
          "Workflow planned: retrieve documents → create embeddings → analyze → evaluate → check safety",
        start_time: baseTime,
        end_time: baseTime + 500,
        level: "DEFAULT",
        environment: trace.environment,
        metadata: { role: "coordinator", step: "1" },
      }),
    );

    // 2. RETRIEVER - Document retrieval
    observations.push(
      createObservation({
        id: `${traceId}-retriever`,
        trace_id: trace.id,
        project_id: projectId,
        parent_observation_id: `${traceId}-agent`,
        type: "RETRIEVER",
        name: this.randomElement(REALISTIC_RETRIEVER_NAMES),
        input: "query: quantum computing research papers 2024",
        output: "Retrieved 15 relevant research papers from arXiv and IEEE",
        start_time: baseTime + 500,
        end_time: baseTime + 2000,
        level: "DEFAULT",
        environment: trace.environment,
        metadata: { documentsFound: "15", sources: "arXiv,IEEE" },
      }),
    );

    // 3. EMBEDDING - Create document embeddings
    observations.push(
      createObservation({
        id: `${traceId}-embedding`,
        trace_id: trace.id,
        project_id: projectId,
        parent_observation_id: `${traceId}-retriever`,
        type: "EMBEDDING",
        name: this.randomElement(REALISTIC_EMBEDDING_NAMES),
        input: "15 research paper abstracts and titles",
        output: "Generated 1536-dimensional embeddings for semantic similarity",
        start_time: baseTime + 2000,
        end_time: baseTime + 3500,
        level: "DEFAULT",
        environment: trace.environment,
        metadata: {
          embeddingModel: "text-embedding-ada-002",
          dimensions: "1536",
        },
        usage_details: {
          input: this.randomInt(2000, 4000),
          total: this.randomInt(2000, 4000),
        },
        provided_usage_details: {
          input: this.randomInt(2000, 4000),
          total: this.randomInt(2000, 4000),
        },
        cost_details: {
          input: this.randomInt(5, 15) / 100000,
          total: this.randomInt(5, 15) / 100000,
        },
        provided_cost_details: {
          input: this.randomInt(5, 15) / 100000,
          total: this.randomInt(5, 15) / 100000,
        },
      }),
    );

    // 4. CHAIN - Processing pipeline
    observations.push(
      createObservation({
        id: `${traceId}-chain`,
        trace_id: trace.id,
        project_id: projectId,
        parent_observation_id: `${traceId}-embedding`,
        type: "CHAIN",
        name: this.randomElement(REALISTIC_CHAIN_NAMES),
        input: "Research papers with embeddings",
        output:
          "Processed and analyzed 15 papers through multi-step analysis chain",
        start_time: baseTime + 3500,
        end_time: baseTime + 8000,
        level: "DEFAULT",
        environment: trace.environment,
        metadata: { steps: "4", processed: "15" },
      }),
    );

    // 5. TOOL - External API call for additional context
    observations.push(
      createObservation({
        id: `${traceId}-tool`,
        trace_id: trace.id,
        project_id: projectId,
        parent_observation_id: `${traceId}-chain`,
        type: "TOOL",
        name: this.randomElement(REALISTIC_TOOL_NAMES),
        input: "Search for quantum computing market trends",
        output:
          "Market data: $1.2B industry, 25% YoY growth, key players identified",
        start_time: baseTime + 8000,
        end_time: baseTime + 10000,
        level: "DEFAULT",
        environment: trace.environment,
        metadata: { toolType: "api-call", endpoint: "market-research" },
      }),
    );

    // 6. GENERATION - Final summary generation
    const toolObservation = observations[observations.length - 1];
    const toolName = toolObservation.name || "WebSearchTool";
    observations.push(
      createObservation({
        id: `${traceId}-generation`,
        trace_id: trace.id,
        project_id: projectId,
        parent_observation_id: `${traceId}-tool`,
        type: "GENERATION",
        name: this.randomElement(REALISTIC_GENERATION_NAMES),
        input:
          "Synthesize research analysis and market data into comprehensive summary",
        output:
          "Generated comprehensive 2000-word analysis of quantum computing research trends",
        provided_model_name: this.randomElement(REALISTIC_MODELS),
        model_parameters: JSON.stringify({
          temperature: 0.3,
          max_tokens: 2000,
        }),
        start_time: baseTime + 10000,
        end_time: baseTime + 15000,
        level: "DEFAULT",
        environment: trace.environment,
        usage_details: {
          input: this.randomInt(1500, 2500),
          output: this.randomInt(1800, 2200),
          total: this.randomInt(3300, 4700),
        },
        provided_usage_details: {
          input: this.randomInt(1500, 2500),
          output: this.randomInt(1800, 2200),
          total: this.randomInt(3300, 4700),
        },
        cost_details: {
          input: this.randomInt(15, 25) / 100000,
          output: this.randomInt(35, 45) / 100000,
          total: this.randomInt(50, 70) / 100000,
        },
        provided_cost_details: {
          input: this.randomInt(15, 25) / 100000,
          output: this.randomInt(35, 45) / 100000,
          total: this.randomInt(50, 70) / 100000,
        },
        tool_definitions: {
          WebSearchTool: "Search the web for information",
          CalculatorTool: "Perform mathematical calculations",
          WeatherForecastTool: "Get weather forecasts and data",
          EmailSenderTool: "Send emails to recipients",
        },
        tool_calls: ["call_workflow_1"],
        tool_call_names: [toolName],
      }),
    );

    // 7. EVALUATOR - Quality evaluation
    observations.push(
      createObservation({
        id: `${traceId}-evaluator`,
        trace_id: trace.id,
        project_id: projectId,
        parent_observation_id: `${traceId}-generation`,
        type: "EVALUATOR",
        name: this.randomElement(REALISTIC_EVALUATOR_NAMES),
        input: "Evaluate summary quality, accuracy, and completeness",
        output: "Quality score: 8.7/10, High accuracy, Comprehensive coverage",
        start_time: baseTime + 15000,
        end_time: baseTime + 16500,
        level: "DEFAULT",
        environment: trace.environment,
        metadata: {
          qualityScore: "8.7",
          accuracy: "high",
          completeness: "comprehensive",
        },
      }),
    );

    // 8. GUARDRAIL - Safety and compliance check
    observations.push(
      createObservation({
        id: `${traceId}-guardrail`,
        trace_id: trace.id,
        project_id: projectId,
        parent_observation_id: `${traceId}-evaluator`,
        type: "GUARDRAIL",
        name: this.randomElement(REALISTIC_GUARDRAIL_NAMES),
        input: "Check content for safety, bias, and compliance issues",
        output:
          "✓ Content approved: No safety issues, Low bias detected, Compliant",
        start_time: baseTime + 16500,
        end_time: baseTime + 17000,
        level: "DEFAULT",
        environment: trace.environment,
        metadata: {
          safetyCheck: "passed",
          biasLevel: "low",
          compliance: "approved",
        },
      }),
    );

    return { trace, observations };
  }

  /**
   * Creates evaluation traces for testing evaluator configurations.
   * Use for: Evaluation testing, score validation, evaluator development.
   */
  generateEvaluationTraces(
    projectId: string,
    count: number,
  ): TraceRecordInsertType[] {
    const traces: TraceRecordInsertType[] = [];

    for (const evalJobConfiguration of SEED_EVALUATOR_CONFIGS) {
      for (let i = 0; i < count; i++) {
        const traceId = generateEvalTraceId(
          evalJobConfiguration.evalTemplateId,
          i,
          projectId,
        );
        const trace = createTrace({
          id: traceId,
          session_id: null,
          project_id: projectId,
          name: this.randomElement(REALISTIC_TRACE_NAMES),
          input: this.generateEvaluationInput(),
          output: this.generateEvaluationOutput(),
          user_id: this.randomBoolean(0.3)
            ? `user_${this.randomInt(1, 1000)}`
            : null,
          environment: "langfuse-evaluation",
          metadata: { purpose: "evaluation" },
          tags: this.randomBoolean(0.3) ? ["production", "ai-agent"] : [],
          public: this.randomBoolean(0.8),
          bookmarked: this.randomBoolean(0.1),
          release: this.randomBoolean(0.4)
            ? `v${this.randomInt(1, 5)}.${this.randomInt(0, 10)}`
            : null,
          version: this.randomBoolean(0.4)
            ? `v${this.randomInt(1, 3)}.${this.randomInt(0, 20)}`
            : null,
        });

        traces.push(trace);
      }
    }

    return traces;
  }

  private generateTraceInput(): string {
    if (!this.fileContent) return "Sample input";

    // Match original logic: 30% chance of heavy markdown, otherwise chatML
    return this.randomBoolean(0.3)
      ? this.fileContent.heavyMarkdown
      : JSON.stringify(this.fileContent.chatMlJson);
  }

  private generateTraceOutput(): string {
    if (!this.fileContent) return "Sample output";

    // Match original logic: 20% chance of nested JSON, otherwise chatML
    return this.randomBoolean(0.2)
      ? JSON.stringify(this.fileContent.nestedJson)
      : JSON.stringify(this.fileContent.chatMlJson);
  }

  private generateObservationInput(): string {
    if (!this.fileContent) return "Sample observation input";

    // Match original logic: 40% chance of heavy markdown, otherwise chatML
    return this.randomBoolean(0.4)
      ? this.fileContent.heavyMarkdown
      : JSON.stringify(this.fileContent.chatMlJson);
  }

  private generateObservationOutput(): string {
    if (!this.fileContent) return "Sample observation output";

    // Match original logic: 30% chance of nested JSON, otherwise chatML
    return this.randomBoolean(0.3)
      ? JSON.stringify(this.fileContent.nestedJson)
      : JSON.stringify(this.fileContent.chatMlJson);
  }

  private generateEvaluationInput(): string {
    if (!this.fileContent) return "Evaluation input";

    return this.randomBoolean(0.3)
      ? this.fileContent.heavyMarkdown
      : JSON.stringify(this.fileContent.chatMlJson);
  }

  private generateEvaluationOutput(): string {
    if (!this.fileContent) return "Evaluation output";

    return this.randomBoolean(0.2)
      ? JSON.stringify(this.fileContent.nestedJson)
      : JSON.stringify(this.fileContent.chatMlJson);
  }

  /**
   * Creates realistic support chat session data with conversational flow.
   * Use for: Demonstrating session-based conversations with tool calls and scoring.
   */
  generateSupportChatSessionData(projectId: string): {
    traces: TraceRecordInsertType[];
    observations: ObservationRecordInsertType[];
    scores: ScoreRecordInsertType[];
  } {
    // Domain: Art museum membership support (non-tech)
    const dialogues = [
      {
        user: "Hi—my family membership at the City Art Museum was charged twice this month.",
        assistant:
          "Sorry about that. I can help. Could you share your membership ID and the last 4 digits of the card?",
      },
      {
        user: "Membership ID is CAM-48291, card ending 4417.",
        assistant: "Thanks. I'll check your billing records now.",
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
          "Refund RFND-20931 has been issued. You'll see it on your statement within 3–5 business days.",
      },
      {
        user: "No, that's all. Appreciate the quick help!",
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
        assistant: "You're all set. Have a great day!",
      },
    ];

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

    // Create one GENERATION observation per trace
    const observations: ObservationRecordInsertType[] = dialogues
      .map((d, index) => {
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
          tool_definitions: d.tool
            ? {
                "billing.lookup":
                  "Look up billing records and transaction history",
                "billing.refund":
                  "Issue refunds for duplicate or erroneous charges",
              }
            : undefined,
          tool_calls: d.tool ? [`call_${index}`] : undefined,
          tool_call_names: d.tool ? [d.tool.name] : undefined,
        };

        if (!d.tool) return [baseGen];

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
          tool_definitions: undefined,
          tool_calls: undefined,
        };

        return [toolObs, baseGen];
      })
      .flat();

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
          long_string_value: "",
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
          long_string_value: "",
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
              long_string_value: "",
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

    return { traces, observations, scores };
  }

  /**
   * Creates exactly one score per evaluation trace with prefixed IDs.
   * Use for: Evaluation traces that need score validation, evaluator testing.
   */
  generateEvaluationScores(
    traces: TraceRecordInsertType[],
    _observations: ObservationRecordInsertType[],
    projectId: string,
  ): ScoreRecordInsertType[] {
    const scores: ScoreRecordInsertType[] = [];

    for (const evalJobConfiguration of SEED_EVALUATOR_CONFIGS) {
      traces.forEach((trace, traceIndex) => {
        if (traceIndex % FAILED_EVAL_TRACE_INTERVAL === 0) return;
        // Create exactly one score per evaluation trace with prefixed ID
        const score: ScoreRecordInsertType = createTraceScore({
          id: generateEvalScoreId(
            evalJobConfiguration.evalTemplateId,
            traceIndex,
            projectId,
          ), // Use prefixed ID pattern
          project_id: projectId,
          trace_id: trace.id,
          observation_id: undefined, // Score is for the entire trace, not a specific observation
          name: `evaluation_score-${evalJobConfiguration.evalTemplateId}`,
          value: Math.random() * 100, // Random evaluation score 0-100
          string_value: undefined,
          data_type: "NUMERIC",
          source: "EVAL",
          comment: "Evaluation trace score",
          environment: trace.environment,
        });

        scores.push(score);
      });
    }

    return scores;
  }
}
