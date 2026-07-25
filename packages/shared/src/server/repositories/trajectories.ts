import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  extractTrajectory,
  type TrajectoryFeatures,
  type TrajectoryNode,
} from "../trajectories/signature";
import { queryClickhouse } from "./clickhouse";

/**
 * Reading agent trajectories out of ClickHouse.
 *
 * The observation tree is already stored - `parent_observation_id` gives the
 * edges and v4's `type` column gives each node its role - so trajectories need
 * no new table. This module pulls the trees and hands them to the pure
 * extractor in ../trajectories/signature.
 *
 * Runs are grouped by trace *name*, which is the pipeline identity: every run
 * of the docfraud reviewer is named `docfraud-review`. Comparing a run against
 * runs of a different pipeline would be meaningless.
 */

/** A pipeline: one trace name, and how many runs of it exist in the window. */
export type TrajectoryPipeline = {
  name: string;
  runs: number;
};

export type TrajectoryRun = {
  traceId: string;
  timestamp: Date;
  features: TrajectoryFeatures;
};

type ObservationRow = {
  trace_id: string;
  id: string;
  parent_observation_id: string | null;
  type: string;
  name: string;
  start_time: string;
  level: string | null;
};

type PipelineRow = { name: string; runs: string };

/**
 * Observations can land after the trace row that owns them. The repository
 * README measures this at 97% within 2 minutes with a long tail, and settles
 * on a 1 hour cutoff; the same window is used here so a run whose spans
 * arrived late is not silently truncated into a wrong signature.
 */
const OBSERVATION_LOOKAHEAD_HOURS = 1;

export async function getTrajectoryPipelines(params: {
  projectId: string;
  fromTimestamp: Date;
  toTimestamp: Date;
  limit?: number;
}): Promise<TrajectoryPipeline[]> {
  const query = `
    SELECT name, count() AS runs
    FROM traces FINAL
    WHERE project_id = {projectId: String}
      AND timestamp >= {fromTimestamp: DateTime64(3)}
      AND timestamp <= {toTimestamp: DateTime64(3)}
      AND name != ''
    GROUP BY name
    ORDER BY runs DESC
    LIMIT {limit: UInt32}
  `;

  const rows = await queryClickhouse<PipelineRow>({
    query,
    params: {
      projectId: params.projectId,
      fromTimestamp: convertDateToClickhouseDateTime(params.fromTimestamp),
      toTimestamp: convertDateToClickhouseDateTime(params.toTimestamp),
      limit: params.limit ?? 100,
    },
    tags: { projectId: params.projectId, route: "trajectories.pipelines" },
  });

  return rows.map((r) => ({ name: r.name, runs: Number(r.runs) }));
}

/**
 * Fetch every run of one pipeline in a window, already reduced to features.
 *
 * Only the columns the signature needs are selected. Pulling input/output here
 * would multiply the transferred bytes by orders of magnitude for data the
 * shape analysis never looks at.
 */
export async function getTrajectoryRuns(params: {
  projectId: string;
  traceName: string;
  fromTimestamp: Date;
  toTimestamp: Date;
  maxRuns?: number;
}): Promise<TrajectoryRun[]> {
  const maxRuns = params.maxRuns ?? 5000;

  const query = `
    WITH matching_traces AS (
      SELECT id, timestamp
      FROM traces FINAL
      WHERE project_id = {projectId: String}
        AND name = {traceName: String}
        AND timestamp >= {fromTimestamp: DateTime64(3)}
        AND timestamp <= {toTimestamp: DateTime64(3)}
      ORDER BY timestamp DESC
      LIMIT {maxRuns: UInt32}
    )
    SELECT
      o.trace_id AS trace_id,
      o.id AS id,
      o.parent_observation_id AS parent_observation_id,
      o.type AS type,
      o.name AS name,
      o.start_time AS start_time,
      o.level AS level
    FROM observations o FINAL
    INNER JOIN matching_traces t ON t.id = o.trace_id
    WHERE o.project_id = {projectId: String}
      AND o.start_time >= {fromTimestamp: DateTime64(3)} - INTERVAL 1 HOUR
      AND o.start_time <= {toTimestamp: DateTime64(3)} + INTERVAL ${OBSERVATION_LOOKAHEAD_HOURS} HOUR
  `;

  const rows = await queryClickhouse<ObservationRow>({
    query,
    params: {
      projectId: params.projectId,
      traceName: params.traceName,
      fromTimestamp: convertDateToClickhouseDateTime(params.fromTimestamp),
      toTimestamp: convertDateToClickhouseDateTime(params.toTimestamp),
      maxRuns,
    },
    tags: { projectId: params.projectId, route: "trajectories.runs" },
  });

  const nodesByTrace = new Map<string, TrajectoryNode[]>();
  const earliestByTrace = new Map<string, number>();

  for (const row of rows) {
    const node: TrajectoryNode = {
      id: row.id,
      parentId: row.parent_observation_id || null,
      type: row.type,
      name: row.name,
      startTime: row.start_time,
      level: row.level,
    };
    const bucket = nodesByTrace.get(row.trace_id);
    if (bucket) bucket.push(node);
    else nodesByTrace.set(row.trace_id, [node]);

    const at = Date.parse(row.start_time);
    const current = earliestByTrace.get(row.trace_id);
    if (!Number.isNaN(at) && (current === undefined || at < current)) {
      earliestByTrace.set(row.trace_id, at);
    }
  }

  return [...nodesByTrace.entries()]
    .map(([traceId, nodes]) => ({
      traceId,
      timestamp: new Date(earliestByTrace.get(traceId) ?? 0),
      features: extractTrajectory(nodes),
    }))
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
