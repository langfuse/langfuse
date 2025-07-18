import { queryClickhouse } from "./clickhouse";
import { queryDoris } from "./doris";
import { isDorisBackend } from "./analytics";

export type EnvironmentFilterProps = {
  projectId: string;
};

export const getEnvironmentsForProject = async (
  props: EnvironmentFilterProps,
): Promise<{ environment: string }[]> => {
  const { projectId } = props;

  if (isDorisBackend()) {
    const query = `
      SELECT environments
      FROM project_environments
      WHERE project_id = {projectId: String}
    `;

    const results = await queryDoris<{
      environments: string[];
    }>({
      query,
      params: { projectId },
      tags: {
        feature: "tracing",
        type: "environment",
        kind: "byId",
        projectId,
      },
    });

    const environments = results.length > 0 ? results[0].environments : [];
    environments.push("default");
    return Array.from(new Set(environments)).map((environment) => ({
      environment,
    }));
  } else {
    const query = `
      SELECT environments
      FROM project_environments FINAL
      WHERE project_id = {projectId: String}
    `;

    const results = await queryClickhouse<{
      environments: string[];
    }>({
      query,
      params: { projectId },
      tags: {
        feature: "tracing",
        type: "environment",
        kind: "byId",
        projectId,
      },
    });

    const environments = results.length > 0 ? results[0].environments : [];
    environments.push("default");
    return Array.from(new Set(environments)).map((environment) => ({
      environment,
    }));
  }
};
