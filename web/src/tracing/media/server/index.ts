// The media feature's public server surface (RFC rules 8 and 10).
// mediaRouter stays a direct import from the tRPC root.
export {
  createMediaUploadUrl,
  getMedia,
  updateMediaUploadStatus,
} from "@/src/tracing/media/server/mediaService";
export {
  datasetItemMediaReferenceKey,
  resolveDatasetItemMediaReferences,
} from "@/src/tracing/media/server/datasetItemMediaReferences";
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
} from "@/src/tracing/media/validation";
