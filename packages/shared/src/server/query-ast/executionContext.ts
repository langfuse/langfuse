/**
 * Compile-time tenancy scope. Every ClickHouse query compiled through
 * {@link compileClickhouseQuery} must carry one of these; the tenancy
 * injection pass keys off `projectId`.
 */
export type ExecutionContext = {
  projectId: string;
};
