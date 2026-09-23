import useIsFeatureEnabled from "./useIsFeatureEnabled";
import { INTERNAL_FEATURE_FLAG } from "../available-flags";

export function useInternalFeaturesEnabled() {
  return useIsFeatureEnabled(INTERNAL_FEATURE_FLAG);
}
