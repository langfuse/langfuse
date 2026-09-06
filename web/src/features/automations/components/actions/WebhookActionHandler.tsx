import React from "react";
import { type UseFormReturn } from "react-hook-form";
import type {
  ActionValidationError,
  BaseActionHandler,
} from "./BaseActionHandler";
import { WebhookActionForm, formatWebhookHeaders } from "./WebhookActionForm";
import {
  type AutomationDomain,
  type AvailableWebhookApiSchema,
  WebhookProtectedHeaders,
  TriggerEventSource,
  type ActionCreate,
  type ActionDomain,
} from "@langfuse/shared";
import type { z } from "zod";

type WebhookActionFormData = {
  webhook: {
    url: string;
    headers: HeaderPair[];
  };
};

/**
 * apiVersionForEventSource derives the stored webhook payload version from the
 * trigger's event source. There is only one version per source today, so this
 * is not user-editable and is deliberately not part of the form state — keeping
 * it derived is what stops it from drifting when the event source changes.
 */
const apiVersionForEventSource = (
  eventSource?: TriggerEventSource,
): z.infer<typeof AvailableWebhookApiSchema> => {
  switch (eventSource) {
    case TriggerEventSource.Monitor:
      return { monitor: "v1" };
    case TriggerEventSource.ProjectNotification:
      return { "project-notification": "v1" };
    default:
      return { prompt: "v1" };
  }
};

// Define a type for header pairs
type HeaderPair = {
  name: string;
  value: string;
  displayValue: string;
  isSecret: boolean;
  wasSecret: boolean;
};

export class WebhookActionHandler implements BaseActionHandler<WebhookActionFormData> {
  actionType = "WEBHOOK" as const;

  // Parse existing headers if available
  private parseHeaders(automation?: AutomationDomain): HeaderPair[] {
    if (
      automation?.action?.type === "WEBHOOK" &&
      automation?.action?.config &&
      "displayHeaders" in automation.action.config &&
      automation.action.config.displayHeaders
    ) {
      try {
        const displayHeaders = automation.action.config.displayHeaders;

        return Object.entries(displayHeaders).map(([name, headerObj]) => ({
          name,
          value: headerObj.secret ? "" : headerObj.value,
          displayValue: headerObj.value,
          isSecret: headerObj.secret,
          wasSecret: headerObj.secret,
        }));
      } catch (e) {
        console.error("Failed to parse headers:", e);
        return [];
      }
    }
    return [];
  }

  getDefaultValues(automation?: AutomationDomain): WebhookActionFormData {
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

  validateFormData(formData: WebhookActionFormData): {
    isValid: boolean;
    errors?: ActionValidationError[];
  } {
    const errors: ActionValidationError[] = [];

    if (!formData.webhook?.url) {
      errors.push({ code: "webhookUrlRequired" });
    }

    // Validate headers
    if (formData.webhook?.headers) {
      formData.webhook.headers.forEach((header: HeaderPair, index: number) => {
        // Only validate non-empty headers
        if (header.name.trim() || header.value.trim()) {
          if (!header.name.trim()) {
            errors.push({ code: "headerNameEmpty", index: index + 1 });
          }
          if (!header.value.trim() && !header.isSecret) {
            errors.push({ code: "headerValueEmpty", index: index + 1 });
          }
          if (header.wasSecret !== header.isSecret && !header.value.trim()) {
            errors.push({
              code: "headerVisibilityValueRequired",
              index: index + 1,
              visibility: header.wasSecret ? "public" : "secret",
            });
          }

          // Check if header name conflicts with managed headers
          if (
            header.name.trim() &&
            WebhookProtectedHeaders.includes(header.name.trim().toLowerCase())
          ) {
            errors.push({
              code: "protectedHeader",
              index: index + 1,
              name: header.name,
            });
          }
        }
      });

      // check if header name is already in the form
      // Check for duplicate header names (case-insensitive)
      const headerNames = formData.webhook.headers
        .filter((h) => h.name.trim()) // Only check non-empty header names
        .map((h) => h.name.trim().toLowerCase());

      const uniqueHeaderNames = new Set(headerNames);
      if (uniqueHeaderNames.size < headerNames.length) {
        errors.push({ code: "duplicateHeaderNames" });
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(
    formData: WebhookActionFormData,
    eventSource?: TriggerEventSource,
  ): ActionCreate {
    // Convert headers array to requestHeaders format
    let headersObject: Record<string, { secret: boolean; value: string }> = {};

    if (formData.webhook?.headers) {
      headersObject = formatWebhookHeaders(formData.webhook.headers);
    }

    return {
      type: "WEBHOOK",
      url: formData.webhook?.url || "",
      requestHeaders: headersObject,
      apiVersion: apiVersionForEventSource(eventSource),
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
