import { z } from "zod";

export enum MediaEnabledFields {
  Input = "input",
  Output = "output",
  Total = "total",
}

export enum MediaContentType {
  PNG = "image/png",
  JPEG = "image/jpeg",
  JPG = "image/jpg",
  WEBP = "image/webp",
  MP3 = "audio/mpeg",
  MP3_LEGACY = "audio/mp3",
  WAV = "audio/wav",
  MP4 = "video/mp4",
  MP4_LEGACY = "video/mpeg",
  MP4_ALT = "video/mpeg4",
  TXT = "text/plain",
  PDF = "application/pdf",
}

export enum MediaFileExtension {
  PNG = "png",
  JPG = "jpg",
  JPEG = "jpeg",
  WEBP = "webp",
  MP3 = "mp3",
  MP4 = "mp4",
  WAV = "wav",
  TXT = "txt",
  PDF = "pdf",
}

export const GetMediaUploadUrlQuerySchema = z.object({
  traceId: z.string(),
  observationId: z.string().nullish(),
  contentType: z.nativeEnum(MediaContentType),
  sha256Hash: z
    .string()
    .regex(
      /^[a-f0-9]{64}$/,
      "Must be a 64 character hex representation of a SHA-256 hash",
    ),
  field: z.nativeEnum(MediaEnabledFields),
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

export const PatchMediaUploadedAtQuery = z.object({
  mediaId: z.string(),
  uploadedAt: z.coerce.date(),
});

export type PatchMediaUploadedAtQuery = z.infer<
  typeof PatchMediaUploadedAtQuery
>;

export const GetMediaQuerySchema = z.object({
  mediaId: z.string(),
});

export type GetMediaQuery = z.infer<typeof GetMediaQuerySchema>;

export const GetMediaResponseSchema = z.object({
  mediaId: z.string(),
  contentType: z.string(),
  uploadedAt: z.coerce.date().nullish(),
  url: z.string(),
  urlExpiry: z.string(),
});

export type GetMediaResponse = z.infer<typeof GetMediaResponseSchema>;
