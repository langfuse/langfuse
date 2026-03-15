import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type BaseActionHandler } from "./BaseActionHandler";
import { MicrosoftTeamsActionForm } from "./MicrosoftTeamsActionForm";
import {
  type AutomationDomain,
  type ActionCreate,
  type ActionDomain,
} from "@langfuse/shared";
import { z } from "zod/v4";

export const MicrosoftTeamsActionFormSchema = z.object({
  microsoftTeams: z.object({
    webhookUrl: z.string().url("Invalid URL"),
  }),
});

type MicrosoftTeamsActionFormData = z.infer<
  typeof MicrosoftTeamsActionFormSchema
>;

export class MicrosoftTeamsActionHandler
  implements BaseActionHandler<MicrosoftTeamsActionFormData>
{
  actionType = "MICROSOFT_TEAMS" as const;

  getDefaultValues(
    automation?: AutomationDomain,
  ): MicrosoftTeamsActionFormData {
    return {
      microsoftTeams: {
        webhookUrl:
          (automation?.action?.type === "MICROSOFT_TEAMS" &&
            automation?.action?.config &&
            "webhookUrl" in automation.action.config &&
            automation.action.config.webhookUrl) ||
          "",
      },
    };
  }

  validateFormData(formData: MicrosoftTeamsActionFormData): {
    isValid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!formData.microsoftTeams?.webhookUrl) {
      errors.push("Microsoft Teams webhook URL is required");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: MicrosoftTeamsActionFormData): ActionCreate {
    return {
      type: "MICROSOFT_TEAMS",
      ...(formData.microsoftTeams?.webhookUrl
        ? { webhookUrl: formData.microsoftTeams.webhookUrl }
        : {}),
    };
  }

  renderForm(props: {
    form: UseFormReturn<MicrosoftTeamsActionFormData>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }) {
    return (
      <MicrosoftTeamsActionForm
        form={props.form}
        disabled={props.disabled}
        projectId={props.projectId}
        action={props.action}
      />
    );
  }
}
