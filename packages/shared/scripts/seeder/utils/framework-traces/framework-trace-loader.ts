import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  createTrace,
  createObservation,
  logger,
  type TraceRecordInsertType,
  type ObservationRecordInsertType,
  type ScoreRecordInsertType,
} from "../../../../src/server";

/**
 * Loads framework traces from JSON files and converts them to ClickHouse insert types.
 * Expected JSON structure:
 * {
 *   trace: { trace data without observations },
 *   observations: [{ individual observation with id and input/output/metadata and all the other stuff}]
 * }
 */
export class FrameworkTraceLoader {
  private frameworkTracesDir: string;

  constructor() {
    this.frameworkTracesDir = __dirname;
  }

  /**
   * Load and adapt all framework traces for a project.
   */
  loadTracesForProject(projectId: string): {
    traces: TraceRecordInsertType[];
    observations: ObservationRecordInsertType[];
    scores: ScoreRecordInsertType[];
  } {
    const traces: TraceRecordInsertType[] = [];
    const observations: ObservationRecordInsertType[] = [];
    const scores: ScoreRecordInsertType[] = [];

    const files = readdirSync(this.frameworkTracesDir).filter(
      (file) => file.endsWith(".json") && file !== "package.json",
    );

    for (const file of files) {
      const filePath = path.join(this.frameworkTracesDir, file);
      const content = readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);

      const frameworkName = file.replace(".json", "");
      const adapted = this.adaptTrace(data, projectId, frameworkName);

      traces.push(adapted.trace);
      observations.push(...adapted.observations);
      scores.push(...adapted.scores);

      logger.info(
        `Loaded 1 trace with ${adapted.observations.length} observations from ${frameworkName}`,
      );
    }

    return { traces, observations, scores };
  }

  /**
   * Adapt a single framework trace to a specific project.
   */
  private adaptTrace(
    data: any,
    projectId: string,
    frameworkName: string,
  ): {
    trace: TraceRecordInsertType;
    observations: ObservationRecordInsertType[];
    scores: ScoreRecordInsertType[];
  } {
    const rawTrace = data.trace;
    const rawObservations = data.observations || [];

    const originalTraceId = rawTrace.id;
    const newTraceId = originalTraceId;
    // we just change the name for now.
    // const newTraceId = `framework-${frameworkName}-${originalTraceId}-${projectId.slice(-8)}`;
    const newName = `framework-${frameworkName}-${rawTrace.name}`;

    // Parse trace metadata if it's a string
    let metadata = rawTrace.metadata;
    if (typeof metadata === "string") {
      metadata = JSON.parse(metadata);
    }

    // Create trace
    const trace = createTrace({
      id: newTraceId,
      project_id: projectId,
      name: newName,
      timestamp: new Date(rawTrace.timestamp).getTime(),
      input: rawTrace.input,
      output: rawTrace.output,
      user_id: rawTrace.userId,
      session_id: rawTrace.sessionId,
      environment: rawTrace.environment,
      metadata: {
        ...metadata,
        // metadata to filter for those kinda traces
        source: "framework-trace",
        framework: frameworkName,
      },
      release: rawTrace.release,
      version: rawTrace.version,
      public: rawTrace.public,
      bookmarked: rawTrace.bookmarked,
      tags: rawTrace.tags,
    });

    // Map observation IDs (old -> new)
    const obsIdMap = new Map<string, string>();
    for (const obs of rawObservations) {
      const newObsId = `framework-${frameworkName}-${obs.id}-${projectId.slice(-8)}`;
      obsIdMap.set(obs.id, newObsId);
    }

    // Create observations
    const observations: ObservationRecordInsertType[] = [];
    for (const obs of rawObservations) {
      const newObsId = obsIdMap.get(obs.id)!;

      // Map parent observation ID
      const parentObservationId = obs.parentObservationId
        ? obsIdMap.get(obs.parentObservationId) || null
        : null;

      // Convert input/output to strings, preserving null
      const input =
        obs.input === undefined || obs.input === null
          ? obs.input
          : JSON.stringify(obs.input);
      const output =
        obs.output === undefined || obs.output === null
          ? obs.output
          : JSON.stringify(obs.output);

      // Parse metadata if it's a string
      let obsMetadata = obs.metadata;
      if (typeof obsMetadata === "string") {
        obsMetadata = JSON.parse(obsMetadata);
      }

      // Use usage/cost details from JSON if present, otherwise reconstruct from flat fields
      const usageDetails =
        obs.usageDetails && Object.keys(obs.usageDetails).length > 0
          ? obs.usageDetails
          : obs.totalUsage > 0
            ? {
                input: obs.inputUsage,
                output: obs.outputUsage,
                total: obs.totalUsage,
              }
            : undefined;

      const costDetails =
        obs.costDetails && Object.keys(obs.costDetails).length > 0
          ? obs.costDetails
          : obs.totalCost > 0
            ? {
                input: (obs.totalCost * obs.inputUsage) / obs.totalUsage,
                output: (obs.totalCost * obs.outputUsage) / obs.totalUsage,
                total: obs.totalCost,
              }
            : undefined;

      observations.push(
        createObservation({
          id: newObsId,
          trace_id: newTraceId,
          project_id: projectId,
          type: obs.type,
          parent_observation_id: parentObservationId,
          start_time: new Date(obs.startTime).getTime(),
          end_time: obs.endTime ? new Date(obs.endTime).getTime() : undefined,
          name: obs.name,
          metadata: obsMetadata,
          level: obs.level,
          status_message: obs.statusMessage,
          input,
          output,
          provided_model_name: obs.model,
          model_parameters: obs.modelParameters
            ? JSON.stringify(obs.modelParameters)
            : undefined,
          prompt_name: obs.promptName,
          prompt_version: obs.promptVersion,
          usage_details: usageDetails,
          provided_usage_details: obs.providedUsageDetails,
          cost_details: costDetails,
          provided_cost_details: obs.providedCostDetails,
          total_cost: obs.totalCost,
          environment: rawTrace.environment,
        }),
      );
    }

    return { trace, observations, scores: [] };
  }
}
