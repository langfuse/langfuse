import { queryClickhouse } from "./clickhouse";

export type EnvironmentFilterProps = {
  projectId: string;
};

export const getEnvironmentsForProject = async (
  props: EnvironmentFilterProps,
): Promise<{ environment: string }[]> => {
  const { projectId } = props;

  const query = `
    SELECT environments
    FROM project_environments
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

  return (results.length > 0 ? results[0].environments : ["default"]).map(
    (environment) => ({ environment }),
  );
};
