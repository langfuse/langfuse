// The media feature's public server surface (RFC rules 8 and 10).
// mediaRouter stays a direct import from the tRPC root.
export {
  createMediaUploadUrl,
  getMedia,
  updateMediaUploadStatus,
} from "@/src/features/media/server/mediaService";
export {
  datasetItemMediaReferenceKey,
  resolveDatasetItemMediaReferences,
} from "@/src/features/media/server/datasetItemMediaReferences";
export {
  GetMediaQuerySchema,
  GetMediaResponseSchema,
  GetMediaUploadUrlQuerySchema,
  GetMediaUploadUrlResponseSchema,
  MediaContentType,
  PatchMediaBodySchema,
  type GetMediaResponse,
  type GetMediaUploadUrlResponse,
  type MediaReturnType,
} from "@/src/features/media/validation";
