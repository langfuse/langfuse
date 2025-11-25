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
  AVIF = "image/avif",
  HEIC = "image/heic",
  MP3 = "audio/mpeg",
  MP3_LEGACY = "audio/mp3",
  WAV = "audio/wav",
  OGG = "audio/ogg",
  OGA = "audio/oga",
  AAC = "audio/aac",
  M4A = "audio/mp4",
  FLAC = "audio/flac",
  OPUS = "audio/opus",
  WEBA = "audio/webm",
  MP4 = "video/mp4",
  WEBM = "video/webm",
  VIDEO_OGG = "video/ogg",
  MPEG = "video/mpeg",
  MOV = "video/quicktime",
  AVI = "video/x-msvideo",
  MKV = "video/x-matroska",
  TXT = "text/plain",
  HTML = "text/html",
  CSS = "text/css",
  CSV = "text/csv",
  MARKDOWN = "text/markdown",
  PYTHON = "text/x-python",
  JAVASCRIPT = "application/javascript",
  TYPESCRIPT = "text/x-typescript",
  YAML = "application/x-yaml",
  PDF = "application/pdf",
  DOC = "application/msword",
  XLS = "application/vnd.ms-excel",
  XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ZIP = "application/zip",
  JSON = "application/json",
  XML = "application/xml",
  BIN = "application/octet-stream",
  DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  RTF = "application/rtf",
  JSONL = "application/x-ndjson",
  PARQUET = "application/vnd.apache.parquet",
  GZIP = "application/gzip",
  TAR = "application/x-tar",
  SEVEN_Z = "application/x-7z-compressed",
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
  AVIF = "avif",
  HEIC = "heic",
  MP3 = "mp3",
  WAV = "wav",
  OGG = "ogg",
  OGA = "oga",
  AAC = "aac",
  M4A = "m4a",
  FLAC = "flac",
  OPUS = "opus",
  WEBA = "weba",
  MP4 = "mp4",
  WEBM = "webm",
  OGV = "ogv",
  MPEG = "mpeg",
  MOV = "mov",
  AVI = "avi",
  MKV = "mkv",
  TXT = "txt",
  HTML = "html",
  CSS = "css",
  CSV = "csv",
  MD = "md",
  PY = "py",
  JS = "js",
  TS = "ts",
  YAML = "yaml",
  PDF = "pdf",
  DOC = "doc",
  XLS = "xls",
  XLSX = "xlsx",
  ZIP = "zip",
  JSON = "json",
  XML = "xml",
  BIN = "bin",
  DOCX = "docx",
  PPTX = "pptx",
  RTF = "rtf",
  JSONL = "jsonl",
  PARQUET = "parquet",
  GZ = "gz",
  TAR = "tar",
  SEVEN_Z = "7z",
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
