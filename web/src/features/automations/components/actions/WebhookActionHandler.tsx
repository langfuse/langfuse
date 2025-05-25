import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type ActiveAutomation } from "@langfuse/shared/src/server";
import { type BaseActionHandler } from "./BaseActionHandler";
import { WebhookActionForm, formatWebhookHeaders } from "./WebhookActionForm";

// Define a type for header pairs
type HeaderPair = {
  name: string;
  value: string;
};

export class WebhookActionHandler implements BaseActionHandler {
  actionType = "WEBHOOK" as const;

  // Parse existing headers if available
  private parseHeaders(automation?: ActiveAutomation): HeaderPair[] {
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

  getDefaultValues(automation?: ActiveAutomation) {
    return {
      webhook: {
        url:
          (automation?.action?.type === "WEBHOOK" &&
            automation?.action?.config &&
            "url" in automation.action.config &&
            automation.action.config.url) ||
          "",
        headers: this.parseHeaders(automation),
      },
    };
  }

  validateFormData(formData: any): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!formData.webhook?.url) {
      errors.push("Webhook URL is required");
    }

    // Validate headers
    if (formData.webhook?.headers) {
      formData.webhook.headers.forEach((header: HeaderPair, index: number) => {
        // Only validate non-empty headers
        if (header.name.trim() || header.value.trim()) {
          if (!header.name.trim()) {
            errors.push(`Header ${index + 1}: Name cannot be empty`);
          }
          if (!header.value.trim()) {
            errors.push(`Header ${index + 1}: Value cannot be empty`);
          }
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: any) {
    // Convert headers array to object
    let headersObject: Record<string, string> = {};

    if (formData.webhook?.headers) {
      headersObject = formatWebhookHeaders(formData.webhook.headers);
    }

    return {
      version: "1.0",
      url: formData.webhook?.url,
      method: "POST", // Always POST
      headers: headersObject,
    };
  }

  renderForm(props: {
    form: UseFormReturn<any>;
    disabled: boolean;
    projectId: string;
  }) {
    return <WebhookActionForm form={props.form} disabled={props.disabled} />;
  }
}
