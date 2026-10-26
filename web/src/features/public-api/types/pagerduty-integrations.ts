import { z } from "zod";
import {
  PagerDutyIntegrationNameSchema,
  PagerDutyRegionSchema,
  PagerDutyRoutingKeySchema,
} from "@langfuse/shared";

// Strict so the raw routing key can never be added to a response.
export const PagerDutyIntegrationResponse = z
  .object({
    id: z.string(),
    name: z.string(),
    displayRoutingKey: z.string(),
    region: PagerDutyRegionSchema,
  })
  .strict();

export const GetPagerDutyIntegrationsV1Response = z
  .object({ data: z.array(PagerDutyIntegrationResponse) })
  .strict();

export const PostPagerDutyIntegrationV1Body = z
  .object({
    name: PagerDutyIntegrationNameSchema,
    routingKey: PagerDutyRoutingKeySchema,
    region: PagerDutyRegionSchema.default("US"),
  })
  .strict();

export const PagerDutyIntegrationIdQuery = z
  .object({ id: z.string() })
  .strict();

export const PatchPagerDutyIntegrationV1Body = z
  .object({
    name: PagerDutyIntegrationNameSchema.optional(),
    routingKey: PagerDutyRoutingKeySchema.optional(),
    region: PagerDutyRegionSchema.optional(),
  })
  .strict();

export const DeletePagerDutyIntegrationV1Response = z.union([
  z.object({
    message: z.literal("PagerDuty integration successfully deleted"),
  }),
  z.object({
    message: z.string(),
    error: z.literal("PagerDutyIntegrationInUse"),
    automations: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
]);
