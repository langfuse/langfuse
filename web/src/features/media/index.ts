// The media feature's public client surface (RFC rule 8). Named
// re-exports only — the validation types other features already imported
// by file path.
//
// Schemas used by API routes stay on server/index.ts (rule 10).
// MediaEnabledFields stays a deep import. mediaService and
// datasetItemMediaReferences stay on the server door.
export {
  MediaContentType,
  type MediaReturnType,
} from "@/src/features/media/validation";
export { getSignedUrlState } from "@/src/features/media/fns/getSignedUrlState";
export { mediaUrlQueryOptions } from "@/src/features/media/constants/mediaUrlQueryOptions";
export { useMediaPeek } from "@/src/features/media/hooks/useMediaPeek";
