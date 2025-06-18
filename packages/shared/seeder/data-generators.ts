import {
  TraceData,
  ObservationData,
  ScoreData,
  SeederOptions,
  FileContent,
  DatasetItemInput,
} from "./types";
import {
  REALISTIC_TRACE_NAMES,
  REALISTIC_SPAN_NAMES,
  REALISTIC_GENERATION_NAMES,
  REALISTIC_MODELS,
} from "./clickhouse-seed-constants";
import {
  generateDatasetRunTraceId,
  generateEvalObservationId,
  generateEvalScoreId,
  generateEvalTraceId,
} from "./seed-helpers";
import { v4 as uuidv4 } from "uuid";
import { SEED_EVALUATOR_CONFIGS } from "./postgres-seed-constants";

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

  // Dataset-based generators
  generateDatasetTrace(input: DatasetItemInput, projectId: string): TraceData {
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

    return {
      id: traceId,
      name: `dataset-run-item-${uuidv4()}`,
      input: traceInput,
      output: traceOutput,
      environment: "langfuse-prompt-experiments",
      metadata: { experimentType: "langfuse-prompt-experiments" },
      public: false,
      bookmarked: false,
      tags: [],
    };
  }

  generateDatasetObservation(
    trace: TraceData,
    input: DatasetItemInput,
    projectId: string,
  ): ObservationData {
    const observationId = `observation-dataset-${input.datasetName}-${input.itemIndex}-${input.runNumber}-${projectId.slice(-8)}`;

    // Generate variable usage and cost for each observation
    const inputTokens = this.randomInt(30, 150);
    const outputTokens = this.randomInt(10, 80);
    const totalTokens = inputTokens + outputTokens;

    // Cost should be fraction of cents (0.0001-0.01 range)
    const inputCost = (inputTokens * this.randomInt(1, 5)) / 1000000; // $0.000001-0.000005 per token
    const outputCost = (outputTokens * this.randomInt(2, 10)) / 1000000; // $0.000002-0.00001 per token
    const totalCost = inputCost + outputCost;

    return {
      id: observationId,
      traceId: trace.id,
      type: "GENERATION",
      name: `dataset-generation-${input.itemIndex}-run-${input.runNumber}`,
      input: trace.input,
      output: trace.output,
      model: "gpt-3.5-turbo",
      modelParameters: { temperature: 0.7 },
      usageDetails: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      costDetails: {
        input: Math.round(inputCost * 100000) / 100000, // Round to 5 decimal places
        output: Math.round(outputCost * 100000) / 100000,
        total: Math.round(totalCost * 100000) / 100000,
      },
      environment: "langfuse-prompt-experiments",
    };
  }

  // Standard synthetic data generators
  generateSyntheticTraces(
    projectId: string,
    count: number,
    config: SeederOptions,
  ): TraceData[] {
    const traces: TraceData[] = [];

    for (let i = 0; i < count; i++) {
      const trace: TraceData = {
        id: `trace-synthetic-${i}-${projectId.slice(-8)}`,
        name: this.randomElement(REALISTIC_TRACE_NAMES),
        input: this.generateTraceInput(),
        output: this.generateTraceOutput(),
        userId: this.randomBoolean(0.3)
          ? `user_${this.randomInt(1, 1000)}`
          : undefined,
        sessionId: this.randomBoolean(0.3)
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
      };

      traces.push(trace);
    }

    return traces;
  }

  generateEvaluationObservations(
    traces: TraceData[],
    observationsPerTrace: number = 5,
    projectId: string,
  ): ObservationData[] {
    const observations: ObservationData[] = [];

    for (const evalJobConfiguration of SEED_EVALUATOR_CONFIGS) {
      traces.forEach((trace, traceIndex) => {
        for (let i = 0; i < observationsPerTrace; i++) {
          const obsType = this.randomBoolean(0.47)
            ? "GENERATION"
            : this.randomBoolean(0.94)
              ? "SPAN"
              : "EVENT";

          const observation: ObservationData = {
            id: generateEvalObservationId(
              evalJobConfiguration.evalTemplateId,
              traceIndex,
              projectId,
            ),
            traceId: trace.id,
            parentObservationId: undefined,
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
            model:
              obsType === "GENERATION"
                ? this.randomElement(REALISTIC_MODELS)
                : undefined,
            modelParameters:
              obsType === "GENERATION" ? { temperature: 0.7 } : undefined,
            usageDetails:
              obsType === "GENERATION"
                ? {
                    input: this.randomInt(20, 200),
                    output: this.randomInt(10, 100),
                    total: this.randomInt(30, 300),
                  }
                : undefined,
            costDetails:
              obsType === "GENERATION"
                ? {
                    input: this.randomInt(1, 10) / 100000,
                    output: this.randomInt(1, 20) / 100000,
                    total: this.randomInt(2, 30) / 100000,
                  }
                : undefined,
            environment: "langfuse-evaluation",
          };

          observations.push(observation);
        }
      });
    }

    return observations;
  }

  generateSyntheticObservations(
    traces: TraceData[],
    observationsPerTrace: number = 5,
  ): ObservationData[] {
    const observations: ObservationData[] = [];

    traces.forEach((trace, traceIndex) => {
      for (let i = 0; i < observationsPerTrace; i++) {
        const obsType = this.randomElement(["GENERATION", "SPAN", "EVENT"]);

        const observation: ObservationData = {
          id: `obs-synthetic-${traceIndex}-${i}`,
          traceId: trace.id,
          parentObservationId:
            i > 0 ? `obs-synthetic-${traceIndex}-${i - 1}` : undefined,
          type: obsType as any,
          name:
            obsType === "GENERATION"
              ? this.randomElement(REALISTIC_GENERATION_NAMES)
              : this.randomElement(REALISTIC_SPAN_NAMES),
          input:
            obsType === "GENERATION"
              ? this.generateObservationInput()
              : undefined,
          output:
            obsType === "GENERATION"
              ? this.generateObservationOutput()
              : undefined,
          model:
            obsType === "GENERATION"
              ? this.randomElement(REALISTIC_MODELS)
              : undefined,
          modelParameters:
            obsType === "GENERATION" ? { temperature: 0.7 } : undefined,
          usageDetails:
            obsType === "GENERATION"
              ? {
                  input: this.randomInt(20, 200),
                  output: this.randomInt(10, 100),
                  total: this.randomInt(30, 300),
                }
              : undefined,
          costDetails:
            obsType === "GENERATION"
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
        };

        observations.push(observation);
      }
    });

    return observations;
  }

  generateSyntheticScores(
    traces: TraceData[],
    observations: ObservationData[],
    scoresPerTrace: number = 2,
  ): ScoreData[] {
    const scores: ScoreData[] = [];

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

        const score: ScoreData = {
          id: `score-synthetic-${traceIndex}-${i}`,
          traceId: trace.id,
          observationId: this.randomBoolean(0.1)
            ? this.randomElement(
                observations.filter((o) => o.traceId === trace.id),
              )?.id
            : undefined,
          name: `metric_${this.randomInt(1, 10)}`,
          value,
          stringValue,
          dataType: scoreType as any,
          source: "API",
          comment: "Generated score",
          environment: trace.environment,
        };

        scores.push(score);
      }
    });

    return scores;
  }

  // Evaluation-specific generators
  generateEvaluationTraces(projectId: string, count: number): TraceData[] {
    const traces: TraceData[] = [];

    for (const evalJobConfiguration of SEED_EVALUATOR_CONFIGS) {
      for (let i = 0; i < count; i++) {
        const trace: TraceData = {
          id: generateEvalTraceId(
            evalJobConfiguration.evalTemplateId,
            i,
            projectId,
          ),
          name: this.randomElement(REALISTIC_TRACE_NAMES),
          input: this.generateEvaluationInput(),
          output: this.generateEvaluationOutput(),
          userId: this.randomBoolean(0.3)
            ? `user_${this.randomInt(1, 1000)}`
            : undefined,
          environment: "langfuse-evaluation",
          metadata: { purpose: "evaluation" },
          tags: this.randomBoolean(0.3) ? ["production", "ai-agent"] : [],
          public: this.randomBoolean(0.8),
          bookmarked: this.randomBoolean(0.1),
          release: this.randomBoolean(0.4)
            ? `v${this.randomInt(1, 5)}.${this.randomInt(0, 10)}`
            : undefined,
          version: this.randomBoolean(0.4)
            ? `v${this.randomInt(1, 3)}.${this.randomInt(0, 20)}`
            : undefined,
        };

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

  // Generate exactly one score per evaluation trace with proper prefixed ID
  generateEvaluationScores(
    traces: TraceData[],
    _observations: ObservationData[],
    projectId: string,
  ): ScoreData[] {
    const scores: ScoreData[] = [];

    for (const evalJobConfiguration of SEED_EVALUATOR_CONFIGS) {
      traces.forEach((trace, traceIndex) => {
        // Create exactly one score per evaluation trace with prefixed ID
        const score: ScoreData = {
          id: generateEvalScoreId(
            evalJobConfiguration.evalTemplateId,
            traceIndex,
            projectId,
          ), // Use prefixed ID pattern
          traceId: trace.id,
          observationId: undefined, // Score is for the entire trace, not a specific observation
          name: `evaluation_score-${evalJobConfiguration.evalTemplateId}`,
          value: Math.random() * 100, // Random evaluation score 0-100
          stringValue: undefined,
          dataType: "NUMERIC",
          source: "EVAL",
          comment: "Evaluation trace score",
          environment: trace.environment,
        };

        scores.push(score);
      });
    }

    return scores;
  }
}
