import { z } from "zod";

export const WebCalloutHeadersSchema = z.record(z.string(), z.string());

export type WebCalloutHeaders = z.infer<typeof WebCalloutHeadersSchema>;

export const WebCalloutEndpointInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100).default("Default"),
  url: z.url(),
  enabled: z.boolean().default(true),
  toastMessage: z.string().trim().min(1).max(200).default("Callout sent"),
  requestHeaders: WebCalloutHeadersSchema.default({}),
});

export type WebCalloutEndpointInput = z.infer<
  typeof WebCalloutEndpointInputSchema
>;

export const WebCalloutEndpointUpsertInputSchema =
  WebCalloutEndpointInputSchema.extend({
    projectId: z.string(),
  });

export type WebCalloutPayload = {
  version: 1;
  items: Array<{
    projectId: string;
    traceId: string | null;
    observationId: string | null;
    sessionId: string | null;
  }>;
};

export const WebCalloutInvokeInputSchema = z.object({
  projectId: z.string(),
  traceId: z.string().nullable(),
  observationId: z.string().nullable(),
  sessionId: z.string().nullable(),
});

export type WebCalloutInvokeInput = z.infer<typeof WebCalloutInvokeInputSchema>;
