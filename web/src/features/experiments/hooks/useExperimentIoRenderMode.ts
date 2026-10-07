import useLocalStorage from "@/src/components/useLocalStorage";
import { type ExperimentIoRenderMode } from "@/src/features/experiments/types/experimentIoRenderMode";

export function useExperimentIoRenderMode() {
  return useLocalStorage<ExperimentIoRenderMode>(
    "experiment-itemsIoRenderMode",
    "json",
  );
}
