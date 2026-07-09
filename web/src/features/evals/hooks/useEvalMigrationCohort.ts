export type EvalMigrationCohort = "C1" | "C2" | "C3a" | "C3b" | "C4";

/**
 * Returns which eval migration cohort (LFE-10414) the project is in.
 *
 * TODO: replace the stub with the real classification: SDK version
 * (isOtel via events) combined with the targets of all ACTIVE trace-level
 * job_configurations.
 */
export function useEvalMigrationCohort(_projectId: string | undefined): {
  cohort: EvalMigrationCohort;
  isLoading: boolean;
} {
  return { cohort: "C3a", isLoading: false };
}
