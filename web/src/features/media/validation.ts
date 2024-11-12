import { z } from "zod";

export enum MediaEnabledFields {
  Input = "input",
  Output = "output",
  Metadata = "metadata",
}

export enum MediaContentType {
  PNG = "image/png",
  JPEG = "image/jpeg",
  JPG = "image/jpg",
  WEBP = "image/webp",
  MP3 = "audio/mpeg",
  MP3_LEGACY = "audio/mp3",
  WAV = "audio/wav",
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
  contentType: z.nativeEnum(MediaContentType, {
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
  field: z.nativeEnum(MediaEnabledFields, {
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
