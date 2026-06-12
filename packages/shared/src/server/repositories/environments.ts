import { getEnvironmentsForProjectGreptime } from "./greptime/environments";

export type EnvironmentFilterProps = {
  projectId: string;
  fromTimestamp?: Date;
};

/**
 * Distinct environments for a project (04-read-path.md). Delegates to the GreptimeDB read path; the
 * legacy ClickHouse 3-way UNION is removed.
 */
export const getEnvironmentsForProject = async (
  props: EnvironmentFilterProps,
): Promise<{ environment: string }[]> => {
  return getEnvironmentsForProjectGreptime(props);
};
