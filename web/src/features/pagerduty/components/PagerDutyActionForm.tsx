import { type UseFormReturn } from "react-hook-form";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { Form } from "@/src/components/design-system/Form/Form";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { PagerDutyTestEventButtons } from "./PagerDutyTestEventButtons";

const regionOptions: { value: PagerDutyRegion; label: string }[] = [
  { value: "US", label: "US (events.pagerduty.com)" },
  { value: "EU", label: "EU (events.eu.pagerduty.com)" },
];

/** PagerDutyActionForm collects the routing key and region an automation sends to and can send them a test event. */
export function PagerDutyActionForm({
  form,
  disabled,
  projectId,
  actionId,
}: {
  form: UseFormReturn<PagerDutyFormValues>;
  disabled: boolean;
  projectId: string;
  actionId?: string;
}) {
  const displayRoutingKey = form.watch("pagerDuty.displayRoutingKey");
  const routingKey = form.watch("pagerDuty.routingKey");
  const region = form.watch("pagerDuty.region");

  return (
    <div className="space-y-4">
      <Form.Field
        control={form.control}
        name="pagerDuty.routingKey"
        label="Routing key"
        description={routingKeyDescription(displayRoutingKey)}
      >
        {(field) => (
          <div className="max-w-md">
            <PasswordInput
              id={field.id}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              disabled={disabled}
              placeholder={displayRoutingKey ?? "32 characters"}
              aria-describedby={field.inputDescribedById}
              aria-invalid={!!field.error}
              error={!!field.error}
            />
          </div>
        )}
      </Form.Field>
      <Form.Field
        control={form.control}
        name="pagerDuty.region"
        label="Region"
        description="The service region of your PagerDuty account."
      >
        {(field) => (
          <div className="max-w-md">
            <SelectInput<PagerDutyRegion>
              id={field.id}
              value={field.value}
              onValueChange={field.onChange}
              disabled={disabled}
              options={regionOptions}
              placeholder="Select a region"
              aria-describedby={field.inputDescribedById}
            />
          </div>
        )}
      </Form.Field>
      <PagerDutyTestEventButtons
        projectId={projectId}
        region={region}
        routingKey={routingKey.trim() || undefined}
        actionId={storedKeyActionId(actionId, displayRoutingKey)}
        disabled={disabled}
      />
    </div>
  );
}

/** routingKeyDescription explains where the key comes from, and that an empty field keeps the stored key. */
function routingKeyDescription(displayRoutingKey: string | undefined): string {
  const source =
    "The integration key of an Events API v2 integration on a PagerDuty service, or an Event Orchestration routing key. Monitor alerts and project notifications trigger incidents; a recovered monitor resolves its incident. Prompt changes are sent as change events, which never page anyone.";
  if (!displayRoutingKey) return source;
  return `${source} Leave empty to keep ${displayRoutingKey}.`;
}

/** storedKeyActionId is the action whose stored key a test event may use, if it has one. */
function storedKeyActionId(
  actionId: string | undefined,
  displayRoutingKey: string | undefined,
): string | undefined {
  if (!displayRoutingKey) return undefined;
  return actionId;
}

/** PagerDutyFormValues is the PagerDuty part of the automation form. */
type PagerDutyFormValues = {
  pagerDuty: {
    routingKey: string;
    displayRoutingKey?: string;
    region: PagerDutyRegion;
  };
};
