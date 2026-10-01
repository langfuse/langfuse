// The corrections feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
export {
  CorrectionCacheProvider,
  useCorrectionCache,
} from "@/src/features/corrections/contexts/CorrectionCacheContext";
export { getMostRecentCorrection } from "@/src/features/corrections/utils/getMostRecentCorrection";
