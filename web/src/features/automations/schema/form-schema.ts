import { z } from "zod/v4";
import { webhookSchema } from "../components/actions/WebhookActionForm";
import {
  type JobConfigState,
  type ActionType,
  ActionTypeSchema,
} from "@langfuse/shared";

// Define the trigger schema
export const triggerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  eventSource: z.string().min(1, "Event source is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  sampling: z.coerce.number().min(0).max(100).default(100),
  delay: z.coerce.number().min(0).default(0),
  filter: z.array(z.any()).optional(),
});

// Combined form schema
export const automationFormSchema = triggerSchema.extend({
  actionType: ActionTypeSchema,
  webhook: webhookSchema,
});

export type AutomationFormValues = z.infer<typeof automationFormSchema>;

// Helper function to format webhook headers for API
export const formatWebhookHeaders = (
  headers: { name: string; value: string }[],
): Record<string, string> => {
  const headersObject: Record<string, string> = {};

  headers.forEach((header) => {
    if (header.name.trim() && header.value.trim()) {
      headersObject[header.name.trim()] = header.value.trim();
    }
  });

  return headersObject;
};

// Helper function to prepare the form data for API submission
export const prepareFormDataForAPI = (
  data: AutomationFormValues,
  projectId: string,
  triggerId?: string,
  actionId?: string,
) => {
  // Format headers for webhook if applicable
  let headersObject: Record<string, string> = {};
  if (data.actionType === "WEBHOOK" && data.webhook?.headers) {
    headersObject = formatWebhookHeaders(data.webhook.headers);
  }

  // Determine the action config based on action type
  const actionConfig = {
    version: "1.0",
    url: data.webhook?.url,
    method: "POST", // Always POST
    headers: headersObject,
  };

  // Base payload for create/update operations
  const payload = {
    projectId,
    name: data.name,
    eventSource: data.eventSource,
    filter: data.filter && data.filter.length > 0 ? data.filter : null,
    status: data.status as JobConfigState,
    actionType: data.actionType as ActionType,
    actionConfig,
  };

  // For update operation, include triggerId and actionId
  if (triggerId && actionId) {
    return {
      ...payload,
      triggerId,
      actionId,
      actionName: data.name,
    };
  }

  // For create operation
  return {
    ...payload,
    actionName: data.name,
  };
};
