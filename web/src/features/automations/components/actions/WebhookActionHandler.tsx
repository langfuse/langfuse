import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type BaseActionHandler } from "./BaseActionHandler";
import { WebhookActionForm, formatWebhookHeaders } from "./WebhookActionForm";
import {
  type AutomationDomain,
  AvailableWebhookApiSchema,
  WebhookDefaultHeaders,
  type SafeWebhookActionConfig,
  type ActionDomain,
} from "@langfuse/shared";
import { z } from "zod/v4";

// Define the form schema for webhook actions
const WebhookActionFormSchema = z.object({
  webhook: z.object({
    url: z.string().url("Invalid URL"),
    headers: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
        }),
      )
      .default([]),
    apiVersion: AvailableWebhookApiSchema.default({ prompt: "v1" }),
  }),
});

type WebhookActionFormData = z.infer<typeof WebhookActionFormSchema>;

// Define a type for header pairs
type HeaderPair = {
  name: string;
  value: string;
};

export class WebhookActionHandler
  implements BaseActionHandler<WebhookActionFormData>
{
  actionType = "WEBHOOK" as const;

  // Parse existing headers if available
  private parseHeaders(automation?: AutomationDomain): HeaderPair[] {
    if (
      automation?.action?.type === "WEBHOOK" &&
      automation?.action?.config &&
      "headers" in automation.action.config &&
      automation.action.config.headers
    ) {
      try {
        const headersObject = automation.action.config.headers;
        return Object.entries(headersObject).map(([name, value]) => ({
          name,
          value: value as string,
        }));
      } catch (e) {
        console.error("Failed to parse headers:", e);
        return [];
      }
    }
    return [];
  }

  getDefaultValues(automation?: AutomationDomain): WebhookActionFormData {
    // Extract apiVersion from existing config
    let apiVersion = { prompt: "v1" } as const;
    if (
      automation?.action?.type === "WEBHOOK" &&
      automation?.action?.config &&
      "apiVersion" in automation.action.config &&
      automation.action.config.apiVersion
    ) {
      apiVersion = automation.action.config.apiVersion;
    }

    return {
      webhook: {
        url:
          (automation?.action?.type === "WEBHOOK" &&
            automation?.action?.config &&
            "url" in automation.action.config &&
            automation.action.config.url) ||
          "",
        headers: this.parseHeaders(automation),
        apiVersion,
      },
    };
  }

  validateFormData(formData: WebhookActionFormData): {
    isValid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!formData.webhook?.url) {
      errors.push("Webhook URL is required");
    }

    // Validate headers
    if (formData.webhook?.headers) {
      const defaultHeaderKeys = Object.keys(WebhookDefaultHeaders);

      formData.webhook.headers.forEach((header: HeaderPair, index: number) => {
        // Only validate non-empty headers
        if (header.name.trim() || header.value.trim()) {
          if (!header.name.trim()) {
            errors.push(`Header ${index + 1}: Name cannot be empty`);
          }
          if (!header.value.trim()) {
            errors.push(`Header ${index + 1}: Value cannot be empty`);
          }

          // Check if header name conflicts with default headers
          if (
            header.name.trim() &&
            defaultHeaderKeys.includes(header.name.trim().toLowerCase())
          ) {
            errors.push(
              `Header ${index + 1}: "${header.name}" is automatically added by Langfuse and cannot be customized`,
            );
          }
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(
    formData: WebhookActionFormData,
  ): Omit<SafeWebhookActionConfig, "displaySecretKey"> {
    // Convert headers array to object
    let headersObject: Record<string, string> = {};

    if (formData.webhook?.headers) {
      headersObject = formatWebhookHeaders(formData.webhook.headers);
    }

    return {
      type: "WEBHOOK",
      url: formData.webhook?.url || "",
      headers: headersObject,
      apiVersion: formData.webhook?.apiVersion || { prompt: "v1" },
    };
  }

  renderForm(props: {
    form: UseFormReturn<WebhookActionFormData>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }) {
    return (
      <WebhookActionForm
        form={props.form}
        disabled={props.disabled}
        projectId={props.projectId}
        action={props.action}
      />
    );
  }
}
