// The experiments feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
//
// filter-config and experiment-items-filter-config stay deep: filters'
// useFilterState imports them, and routing them here would close a runtime
// cycle. experimentsSearchRegistry stays deep (search-bar server imports
// it). ExperimentsTable, pages, and experimentsRouter stay off this door.
// useExperimentEvaluatorSelection stays deep so evals' template-selector
// does not load CreateExperimentsForm.
export { CreateExperimentsForm } from "@/src/experiments/components/CreateExperimentsForm";
export { ExperimentDisplaySettings } from "@/src/experiments/components/ExperimentDisplaySettings";
export { ExperimentPeekFooter } from "@/src/experiments/components/ExperimentPeekFooter";
export { useEvaluatorDefaults } from "@/src/experiments/hooks/useEvaluatorDefaults";
export { useExperimentAccess } from "@/src/experiments/hooks/useExperimentAccess";
export { useExperimentEvaluatorData } from "@/src/experiments/hooks/useExperimentEvaluatorData";
export { useExperimentPeekNavigation } from "@/src/experiments/hooks/useExperimentPeekNavigation";
export {
  singleRunToExperimentsUrl,
  toExperimentsResultsUrl,
} from "@/src/experiments/utils/experimentUrlTranslation";
