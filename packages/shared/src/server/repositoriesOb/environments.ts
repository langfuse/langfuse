/**
 * Logic mirrors repositories/environments.ts (ClickHouse); syntax adapted for OceanBase.
 * getEnvironmentsForProject: same signature and flow (traces + observations + scores, fromTimestamp, dataTypes).
 * upsertProjectEnvironment: OB-only (CH uses materialized views).
 */
import { AGGREGATABLE_SCORE_TYPES } from "../../domain/scores";
import { DatabaseAdapterFactory } from "../database";
import { convertDateToDateTime } from "../database";

export type EnvironmentFilterProps = {
  projectId: string;
  fromTimestamp?: Date;
};

export const getEnvironmentsForProject = async (
  props: EnvironmentFilterProps,
): Promise<{ environment: string }[]> => {
  const { projectId, fromTimestamp } = props;

  const adapter = DatabaseAdapterFactory.getInstance();
  const fromTs = fromTimestamp ? convertDateToDateTime(fromTimestamp) : null;

  const query = `
    (
      SELECT DISTINCT environment
      FROM (
        SELECT environment, ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) AS rn
        FROM traces
        WHERE project_id = ?
        ${fromTs !== null ? "AND timestamp >= ?" : ""}
      ) t
      WHERE rn = 1
    ) UNION ALL (
      SELECT DISTINCT environment
      FROM (
        SELECT environment, ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) AS rn
        FROM observations
        WHERE project_id = ?
        ${fromTs !== null ? "AND start_time >= ?" : ""}
      ) o
      WHERE o.rn = 1
    ) UNION ALL (
      SELECT DISTINCT environment
      FROM (
        SELECT environment, ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) AS rn
        FROM scores
        WHERE project_id = ?
        AND data_type IN (${AGGREGATABLE_SCORE_TYPES.map(() => "?").join(", ")})
        ${fromTs !== null ? "AND timestamp >= ?" : ""}
      ) s
      WHERE s.rn = 1
    )
  `;

  const params: unknown[] = [
    projectId,
    ...(fromTs !== null ? [fromTs] : []),
    projectId,
    ...(fromTs !== null ? [fromTs] : []),
    projectId,
    ...AGGREGATABLE_SCORE_TYPES,
    ...(fromTs !== null ? [fromTs] : []),
  ];

  const results = await adapter.queryWithOptions<{ environment: string }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "environment",
      kind: "byId",
      projectId,
    },
  });

  results.push({ environment: "default" });

  return Array.from(new Set(results.map((e) => e.environment))).map(
    (environment) => ({
      environment,
    }),
  );
};

/**
 * Upsert project environment data for OceanBase.
 * In ClickHouse, this is handled automatically by materialized views.
 */
export const upsertProjectEnvironment = async (
  projectId: string,
  environment: string | undefined,
): Promise<void> => {
  if (!environment) return;

  try {
    const adapter = DatabaseAdapterFactory.getInstance();

    const existing = await adapter.queryWithOptions<{
      environments: string[] | string;
    }>({
      query: `SELECT environments FROM project_environments WHERE project_id = ?`,
      params: [projectId],
      tags: {
        feature: "tracing",
        type: "environment",
        kind: "select",
        projectId,
      },
    });

    let environments: string[] = [];
    if (existing.length > 0 && existing[0].environments) {
      const raw = existing[0].environments;
      environments = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    }

    if (!environments.includes(environment)) {
      environments.push(environment);
    }

    const envJson = JSON.stringify(environments);

    await adapter.commandWithOptions({
      query: `
        INSERT INTO project_environments (project_id, environments)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE environments = VALUES(environments)
      `,
      params: [projectId, envJson],
      tags: {
        feature: "tracing",
        type: "environment",
        kind: "upsert",
        projectId,
      },
    });
  } catch (e) {
    throw new Error(
      `Failed to upsert project environment for project ${projectId}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
};
