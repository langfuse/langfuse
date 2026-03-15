import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type BaseActionHandler } from "./BaseActionHandler";
import { PagerDutyActionForm } from "./PagerDutyActionForm";
import {
  type AutomationDomain,
  type ActionCreate,
  type ActionDomain,
} from "@langfuse/shared";
import { z } from "zod/v4";

export const PagerDutyActionFormSchema = z.object({
  pagerduty: z.object({
    integrationKey: z.string(),
    displayIntegrationKey: z.string().optional(),
    severity: z.enum(["critical", "error", "warning", "info"]).default("error"),
    source: z.string().optional(),
    component: z.string().optional(),
  }),
});

type PagerDutyActionFormData = z.infer<typeof PagerDutyActionFormSchema>;

export class PagerDutyActionHandler
  implements BaseActionHandler<PagerDutyActionFormData>
{
  actionType = "PAGERDUTY" as const;

  getDefaultValues(automation?: AutomationDomain): PagerDutyActionFormData {
    const config =
      automation?.action?.config?.type === "PAGERDUTY"
        ? automation.action.config
        : null;
    return {
      pagerduty: {
        integrationKey: "",
        displayIntegrationKey: config?.displayIntegrationKey ?? undefined,
        severity: config?.severity ?? "error",
        source: config?.source ?? "",
        component: config?.component ?? "",
      },
    };
  }

  validateFormData(formData: PagerDutyActionFormData): {
    isValid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (
      !formData.pagerduty?.integrationKey &&
      !formData.pagerduty?.displayIntegrationKey
    ) {
      errors.push("PagerDuty integration key is required");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: PagerDutyActionFormData): ActionCreate {
    return {
      type: "PAGERDUTY",
      ...(formData.pagerduty?.integrationKey
        ? { integrationKey: formData.pagerduty.integrationKey }
        : {}),
      severity: formData.pagerduty?.severity ?? "error",
      ...(formData.pagerduty?.source
        ? { source: formData.pagerduty.source }
        : {}),
      ...(formData.pagerduty?.component
        ? { component: formData.pagerduty.component }
        : {}),
    };
  }

  renderForm(props: {
    form: UseFormReturn<PagerDutyActionFormData>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }) {
    return (
      <PagerDutyActionForm
        form={props.form}
        disabled={props.disabled}
        projectId={props.projectId}
        action={props.action}
      />
    );
  }
}
