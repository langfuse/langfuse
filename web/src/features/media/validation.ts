import { z } from "zod";

import {
  datasetItemMediaFields,
  MediaContentType,
  MediaFileExtension,
} from "@langfuse/shared";

export { MediaContentType, MediaFileExtension };

export enum MediaEnabledFields {
  Input = "input",
  Output = "output",
  Metadata = "metadata",
}

/*
  When adding new media content types, also update the supported content types in the server definition
  in fern/apis/server/definition/media.yml and reflect the changes in the SDKs.
 */
const commonMediaUploadFields = {
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
};

// Media is attached to exactly one context: a trace/observation, or a dataset
// item (which need not exist yet). The union enforces the required ids and the
// per-context field set. The absent context's ids may be omitted or sent as
// null (the active side still demands real strings, so the XOR holds) — this
// lets SDKs that serialize unset fields as null validate without omitting keys.
const TraceMediaUploadSchema = z.object({
  ...commonMediaUploadFields,
  traceId: z.string(),
  observationId: z.string().nullish(),
  field: z.enum(Object.values(MediaEnabledFields) as [string, ...string[]]),
  datasetId: z.null().optional(),
  datasetItemId: z.null().optional(),
});

const DatasetItemMediaUploadSchema = z.object({
  ...commonMediaUploadFields,
  datasetId: z.string(),
  datasetItemId: z.string(),
  field: z.enum(datasetItemMediaFields),
  traceId: z.null().optional(),
  observationId: z.null().optional(),
});

export const GetMediaUploadUrlQuerySchema = z.union(
  [TraceMediaUploadSchema, DatasetItemMediaUploadSchema],
  {
    message:
      "Provide either traceId with field input/output/metadata, or datasetId + datasetItemId with field input/expectedOutput/metadata.",
  },
);

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
