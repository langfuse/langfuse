import { jsonSchema } from "@langfuse/shared";
import { getObservationById } from "@langfuse/shared/src/server";
import { z } from "zod";

export const WebhookInputSchema = z.discriminatedUnion("type", [
  z.object({
    observationId: z.string(),
    projectId: z.string(),
    type: z.literal("observation"),
    startTime: z.string(),
    traceId: z.string(),
    observationType: z.enum(["span", "generation", "event"]),
  }),
]);

export type WebhookInput = z.infer<typeof WebhookInputSchema>;

export const executeWebhook = async (input: WebhookInput) => {
  const { observationId, projectId, startTime, traceId, observationType } =
    input;

  const observation = await getObservationById(
    observationId,
    projectId,
    true,
    startTime,
  );
};
