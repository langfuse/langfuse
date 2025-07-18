import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type BaseActionHandler } from "./BaseActionHandler";
import { SlackActionForm } from "./SlackActionForm";
import {
  type AutomationDomain,
  type SlackActionConfig,
  type ActionCreate,
  type ActionDomain,
} from "@langfuse/shared";
import { z } from "zod/v4";

// Define the form schema for Slack actions
const SlackActionFormSchema = z.object({
  slack: z.object({
    channelId: z.string().min(1, "Channel is required"),
    channelName: z.string().min(1, "Channel name is required"),
    messageTemplate: z.string().optional(),
  }),
});

type SlackActionFormData = z.infer<typeof SlackActionFormSchema>;

export class SlackActionHandler
  implements BaseActionHandler<SlackActionFormData>
{
  actionType = "SLACK" as const;

  getDefaultValues(automation?: AutomationDomain): SlackActionFormData {
    const defaultTemplate = `🔔 *Langfuse Automation Alert*

*Event:* {{eventSource}} {{eventAction}}
*Project:* {{projectName}}
*Timestamp:* {{timestamp}}

{{#if trace}}
*Trace ID:* {{trace.id}}
*Trace Name:* {{trace.name}}
*User ID:* {{trace.userId}}
{{/if}}

{{#if prompt}}
*Prompt:* {{prompt.name}} (v{{prompt.version}})
{{/if}}

View in Langfuse: {{langfuseUrl}}`;

    if (automation?.action?.type === "SLACK") {
      const config = automation.action.config as SlackActionConfig;
      return {
        slack: {
          channelId: config.channelId,
          channelName: config.channelName,
          messageTemplate: config.messageTemplate || defaultTemplate,
        },
      };
    }

    return {
      slack: {
        channelId: "",
        channelName: "",
        messageTemplate: defaultTemplate,
      },
    };
  }

  validateFormData(formData: SlackActionFormData): {
    isValid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!formData.slack?.channelId) {
      errors.push("Slack channel is required");
    }

    if (!formData.slack?.channelName) {
      errors.push("Channel name is required");
    }

    // Basic validation of message template
    if (formData.slack?.messageTemplate) {
      const template = formData.slack.messageTemplate;

      // Check for basic template syntax issues
      const openBraces = (template.match(/\{\{/g) || []).length;
      const closeBraces = (template.match(/\}\}/g) || []).length;

      if (openBraces !== closeBraces) {
        errors.push("Invalid template syntax: mismatched braces");
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: SlackActionFormData): ActionCreate {
    return {
      type: "SLACK",
      channelId: formData.slack?.channelId || "",
      channelName: formData.slack?.channelName || "",
      messageTemplate: formData.slack?.messageTemplate || undefined,
    };
  }

  renderForm(props: {
    form: UseFormReturn<SlackActionFormData>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }) {
    return React.createElement(SlackActionForm, {
      form: props.form,
      disabled: props.disabled,
      projectId: props.projectId,
      action: props.action,
    });
  }
}
