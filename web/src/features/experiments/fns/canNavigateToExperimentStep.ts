export function canNavigateToExperimentStep({
  targetStepId,
  useV2Evaluators,
  isLoadingAssignments,
}: {
  targetStepId: string;
  useV2Evaluators: boolean;
  isLoadingAssignments: boolean;
}) {
  return !(
    targetStepId === "review" &&
    useV2Evaluators &&
    isLoadingAssignments
  );
}
