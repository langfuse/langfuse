import React from "react";
import { type UseFormReturn } from "react-hook-form";

import {
  isPagerDutyActionConfig,
  type ActionCreate,
  type AutomationDomain,
} from "@langfuse/shared";
import { type BaseActionHandler } from "./BaseActionHandler";
import { PagerDutyActionForm } from "./PagerDutyActionForm";

/** PagerDutyActionHandler wires the PagerDuty action into the automation form. */
export class PagerDutyActionHandler implements BaseActionHandler<PagerDutyActionFormData> {
  actionType = "PAGERDUTY" as const;

  getDefaultValues(automation?: AutomationDomain): PagerDutyActionFormData {
    const config = automation?.action?.config;
    if (isPagerDutyActionConfig(config)) {
      return {
        pagerDuty: { pagerDutyIntegrationId: config.pagerDutyIntegrationId },
      };
    }
    return { pagerDuty: { pagerDutyIntegrationId: "" } };
  }

  validateFormData(formData: PagerDutyActionFormData): {
    isValid: boolean;
    errors?: string[];
  } {
    if (formData.pagerDuty?.pagerDutyIntegrationId) return { isValid: true };
    return { isValid: false, errors: ["PagerDuty service is required"] };
  }

  buildActionConfig(formData: PagerDutyActionFormData): ActionCreate {
    return {
      type: "PAGERDUTY",
      pagerDutyIntegrationId: formData.pagerDuty.pagerDutyIntegrationId,
    };
  }

  renderForm(props: {
    form: UseFormReturn<PagerDutyActionFormData>;
    disabled: boolean;
    projectId: string;
  }) {
    return React.createElement(PagerDutyActionForm, {
      form: props.form,
      disabled: props.disabled,
      projectId: props.projectId,
    });
  }
}

/** PagerDutyActionFormData is the PagerDuty part of the automation form. */
type PagerDutyActionFormData = {
  pagerDuty: { pagerDutyIntegrationId: string };
};
