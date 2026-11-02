import React from "react";
import { type UseFormReturn } from "react-hook-form";

import {
  type ActionCreate,
  type AutomationDomain,
  type SafePagerDutyActionConfig,
} from "@langfuse/shared";
import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { PagerDutyActionForm } from "@/src/features/pagerduty";
import { type BaseActionHandler } from "./BaseActionHandler";

/** PagerDutyActionHandler wires the PagerDuty action into the automation form. */
export class PagerDutyActionHandler implements BaseActionHandler<PagerDutyActionFormData> {
  actionType = "PAGERDUTY" as const;

  getDefaultValues(automation?: AutomationDomain): PagerDutyActionFormData {
    const config = storedConfig(automation);
    return {
      pagerDuty: {
        routingKey: "", // never populated with the stored key
        displayRoutingKey: config?.displayRoutingKey,
        region: config?.region ?? "US",
      },
    };
  }

  validateFormData(formData: PagerDutyActionFormData): {
    isValid: boolean;
    errors?: string[];
  } {
    const { routingKey, displayRoutingKey } = formData.pagerDuty ?? {};
    if (routingKey?.trim() || displayRoutingKey) return { isValid: true };
    return { isValid: false, errors: ["PagerDuty routing key is required"] };
  }

  buildActionConfig(formData: PagerDutyActionFormData): ActionCreate {
    const routingKey = formData.pagerDuty.routingKey.trim() || undefined;
    return { type: "PAGERDUTY", region: formData.pagerDuty.region, routingKey };
  }

  renderForm(props: {
    form: UseFormReturn<PagerDutyActionFormData>;
    disabled: boolean;
    projectId: string;
    action?: AutomationDomain["action"];
  }) {
    return React.createElement(PagerDutyActionForm, {
      form: props.form,
      disabled: props.disabled,
      projectId: props.projectId,
      actionId: props.action?.id,
    });
  }
}

/** storedConfig returns the saved PagerDuty config of an automation, if any. */
function storedConfig(
  automation?: AutomationDomain,
): SafePagerDutyActionConfig | undefined {
  const config = automation?.action?.config;
  if (config?.type !== "PAGERDUTY") return undefined;
  return config;
}

/** PagerDutyActionFormData is the PagerDuty part of the automation form. */
type PagerDutyActionFormData = {
  pagerDuty: {
    routingKey: string;
    displayRoutingKey?: string;
    region: PagerDutyRegion;
  };
};
