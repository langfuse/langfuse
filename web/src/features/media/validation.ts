import { z } from "zod/v4";

export enum MediaEnabledFields {
  Input = "input",
  Output = "output",
  Metadata = "metadata",
}

/*
  When adding new media content types, also update the supported content types in the server definition
  in fern/apis/server/definition/media.yml and reflect the changes in the SDKs.
 */
export enum MediaContentType {
  PNG = "image/png",
  JPEG = "image/jpeg",
  JPG = "image/jpg",
  WEBP = "image/webp",
  GIF = "image/gif",
  SVG = "image/svg+xml",
  TIFF = "image/tiff",
  BMP = "image/bmp",
  MP3 = "audio/mpeg",
  MP3_LEGACY = "audio/mp3",
  WAV = "audio/wav",
  OGG = "audio/ogg",
  OGA = "audio/oga",
  AAC = "audio/aac",
  M4A = "audio/mp4",
  FLAC = "audio/flac",
  MP4 = "video/mp4",
  WEBM = "video/webm",
  TXT = "text/plain",
  HTML = "text/html",
  CSS = "text/css",
  CSV = "text/csv",
  PDF = "application/pdf",
  DOC = "application/msword",
  XLS = "application/vnd.ms-excel",
  ZIP = "application/zip",
  JSON = "application/json",
  XML = "application/xml",
  BIN = "application/octet-stream",
}

export enum MediaFileExtension {
  PNG = "png",
  JPG = "jpg",
  JPEG = "jpeg",
  WEBP = "webp",
  GIF = "gif",
  SVG = "svg",
  TIFF = "tiff",
  BMP = "bmp",
  MP3 = "mp3",
  WAV = "wav",
  OGG = "ogg",
  OGA = "oga",
  AAC = "aac",
  M4A = "m4a",
  FLAC = "flac",
  MP4 = "mp4",
  WEBM = "webm",
  TXT = "txt",
  HTML = "html",
  CSS = "css",
  CSV = "csv",
  PDF = "pdf",
  DOC = "doc",
  XLS = "xls",
  ZIP = "zip",
  JSON = "json",
  XML = "xml",
  BIN = "bin",
}

export const GetMediaUploadUrlQuerySchema = z.object({
  traceId: z.string(),
  observationId: z.string().nullish(),
  contentType: z.enum(MediaContentType, {
    message: `Invalid content type. Only supporting ${Object.values(
      MediaContentType,
    ).join(", ")}`,
  }),
  contentLength: z.number().positive().int(),
  sha256Hash: z
    .string()
    .regex(
      /^[A-Za-z0-9+/=]{44}$/,
      "Must be a 44 character base64 encoded SHA-256 hash",
    ),
  field: z.enum(MediaEnabledFields, {
    message: `Invalid field. Only supporting ${Object.values(
      MediaEnabledFields,
    ).join(", ")}`,
  }),
});

export type GetMediaUploadUrlQuery = z.infer<
  typeof GetMediaUploadUrlQuerySchema
>;

export const GetMediaUploadUrlResponseSchema = z.object({
  uploadUrl: z.string().nullish(),
  mediaId: z.string(),
});

export type GetMediaUploadUrlResponse = z.infer<
  typeof GetMediaUploadUrlResponseSchema
>;

export const PatchMediaBodySchema = z.object({
  uploadedAt: z.coerce.date(),
  uploadHttpStatus: z.number().positive().int(),
  uploadHttpError: z.string().nullish(),
  uploadTimeMs: z.number().nullish(),
});

export type PatchMediaBody = z.infer<typeof PatchMediaBodySchema>;

export const GetMediaQuerySchema = z.object({
  mediaId: z.string(),
});

export type GetMediaQuery = z.infer<typeof GetMediaQuerySchema>;

export const GetMediaResponseSchema = z.object({
  mediaId: z.string(),
  contentType: z.string(),
  contentLength: z.number(),
  uploadedAt: z.coerce.date().nullish(),
  url: z.string(),
  urlExpiry: z.string(),
});

export type GetMediaResponse = z.infer<typeof GetMediaResponseSchema>;

export const MediaReturnSchema = z.object({
  mediaId: z.string(),
  contentType: z.enum(MediaContentType),
  contentLength: z.coerce.number(),
  url: z.string(),
  urlExpiry: z.string(),
  field: z.enum(MediaEnabledFields),
});

export type MediaReturnType = z.infer<typeof MediaReturnSchema>;
