import { useId } from "react";
import { type UseFormReturn } from "react-hook-form";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import {
  PagerDutyTestEventButtonsView,
  type PagerDutyTestEventState,
} from "@/src/features/pagerduty";
import { Form } from "@/src/components/design-system/Form/Form";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { type MonitorAutomationFormValues } from "../helpers/monitorAutomationFormSchema";
import { describedBy } from "../helpers/describedBy";
import { FieldHelp } from "./FieldHelp";
import { FieldWithHelp } from "./FieldWithHelp";
import { HelpLink } from "./HelpLink";

const integrationDocsUrl =
  "https://support.pagerduty.com/main/docs/services-and-integrations#create-a-generic-events-api-integration";

const regionOptions: { value: PagerDutyRegion; label: string }[] = [
  { value: "US", label: "US (events.pagerduty.com)" },
  { value: "EU", label: "EU (events.eu.pagerduty.com)" },
];

/** PagerDutyActionFields collects the integration key and region, and can send them a test event. */
export function PagerDutyActionFields({
  form,
  testEvent,
}: {
  form: UseFormReturn<MonitorAutomationFormValues>;
  testEvent: PagerDutyTestEventState;
}) {
  const routingKeyHelpId = useId();
  const routingKey = form.watch("pagerDuty.routingKey");
  const region = form.watch("pagerDuty.region");

  return (
    <>
      <FieldWithHelp>
        <Form.Field
          control={form.control}
          name="pagerDuty.routingKey"
          label="Integration Key"
        >
          {(field) => (
            <PasswordInput
              id={field.id}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              placeholder="e.g. R0212P1QXGEIQE2NMTQ7L7WXD00DWHIN"
              aria-describedby={describedBy(
                field.inputDescribedById,
                routingKeyHelpId,
              )}
              aria-invalid={!!field.error}
              error={!!field.error}
            />
          )}
        </Form.Field>
        <FieldHelp id={routingKeyHelpId}>
          Integration key for a PagerDuty Service or Event Orchestration.{" "}
          <HelpLink href={integrationDocsUrl} text="Learn more" />
        </FieldHelp>
      </FieldWithHelp>
      <Form.Field
        control={form.control}
        name="pagerDuty.region"
        label="Region"
        description="The service region of your PagerDuty account."
      >
        {(field) => (
          <SelectInput<PagerDutyRegion>
            id={field.id}
            value={field.value}
            onValueChange={field.onChange}
            options={regionOptions}
            placeholder="Select a region"
            aria-describedby={field.inputDescribedById}
          />
        )}
      </Form.Field>
      <div className="flex">
        <PagerDutyTestEventButtonsView
          target={{ region, routingKey: routingKey.trim() || undefined }}
          testEvent={testEvent}
        />
      </div>
    </>
  );
}
