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
    if (automation?.action?.type === "SLACK") {
      const config = automation.action.config as SlackActionConfig;
      return {
        slack: {
          channelId: config.channelId,
          channelName: config.channelName,
          messageTemplate: config.messageTemplate || undefined,
        },
      };
    }

    return {
      slack: {
        channelId: "",
        channelName: "",
        messageTemplate: undefined,
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
