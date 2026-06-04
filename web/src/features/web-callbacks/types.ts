import { z } from "zod";

export const WebCallbackHeaderSchema = z.object({
  secret: z.boolean(),
  value: z.string(),
});

export const WebCallbackHeadersSchema = z.record(
  z.string(),
  WebCallbackHeaderSchema,
);

export type WebCallbackHeaders = z.infer<typeof WebCallbackHeadersSchema>;

export const WebCallbackEndpointInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100).default("Default"),
  url: z.url(),
  enabled: z.boolean().default(true),
  toastMessage: z.string().trim().min(1).max(200).default("Callback sent"),
  timeoutMs: z.number().int().min(1_000).max(60_000).default(10_000),
  requestHeaders: WebCallbackHeadersSchema.default({}),
});

export type WebCallbackEndpointInput = z.infer<
  typeof WebCallbackEndpointInputSchema
>;

export const WebCallbackEndpointUpsertInputSchema =
  WebCallbackEndpointInputSchema.extend({
    projectId: z.string(),
  });

export const WebCallbackPayloadSchema = z.object({
  version: z.literal(1),
  items: z.array(
    z.object({
      projectId: z.string(),
      traceId: z.string().nullable(),
      observationId: z.string().nullable(),
      sessionId: z.string().nullable(),
    }),
  ),
});

export type WebCallbackPayload = z.infer<typeof WebCallbackPayloadSchema>;
