import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";

export function useObservationEvals() {
  return useIsFeatureEnabled("observationEvals") ?? false;
}

export function useIsObservationEvalsBeta() {
  return true;
}
