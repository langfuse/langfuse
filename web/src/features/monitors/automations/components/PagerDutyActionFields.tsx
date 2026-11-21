import { type UseFormReturn } from "react-hook-form";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { PagerDutyTestEventButtonsView } from "@/src/features/pagerduty/components/PagerDutyTestEventButtonsView";
import { type PagerDutyTestEventState } from "@/src/features/pagerduty/hooks/usePagerDutyTestEvent";
import { Form } from "@/src/components/design-system/Form/Form";
import { type MonitorAutomationFormValues } from "../helpers/monitorAutomationFormSchema";

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
  const routingKey = form.watch("pagerDuty.routingKey");
  const region = form.watch("pagerDuty.region");

  return (
    <>
      <Form.PasswordInputField
        control={form.control}
        name="pagerDuty.routingKey"
        label="Integration Key"
        placeholder="e.g. R0212P1QXGEIQE2NMTQ7L7WXD00DWHIN"
        description={[
          {
            type: "text",
            text: "Integration key for a PagerDuty Service or Event Orchestration. ",
          },
          { type: "link", text: "Learn more", href: integrationDocsUrl },
        ]}
      />
      <Form.SelectInputField
        control={form.control}
        name="pagerDuty.region"
        label="Region"
        description="The service region of your PagerDuty account."
        options={regionOptions}
        placeholder="Select a region"
      />
      <div className="flex">
        <PagerDutyTestEventButtonsView
          target={{ region, routingKey: routingKey.trim() || undefined }}
          testEvent={testEvent}
        />
      </div>
    </>
  );
}
