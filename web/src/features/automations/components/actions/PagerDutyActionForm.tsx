import { type UseFormReturn } from "react-hook-form";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Form } from "@/src/components/design-system/Form/Form";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import {
  PagerDutyTestEventButton,
  usePagerDutyIntegrations,
} from "@/src/features/pagerduty";
import { useHasProjectAccess } from "@/src/features/rbac";

/** NoServicesHint tells the user how to get a routing key added. */
function NoServicesHint({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  if (!canManage) {
    return <>Ask a project admin to connect a PagerDuty service.</>;
  }
  return (
    <>
      Add a routing key in{" "}
      <TextLink
        path={`/project/${projectId}/settings/integrations/pagerduty`}
        value="Settings → Integrations → PagerDuty"
      />
      .
    </>
  );
}

/** NoServicesAlert points to the settings page, or to an admin for users who may not manage integrations. */
function NoServicesAlert({ projectId }: { projectId: string }) {
  const canManage = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  return (
    <Alert>
      <Alert.Title>No PagerDuty services connected</Alert.Title>
      <Alert.Description>
        <NoServicesHint projectId={projectId} canManage={canManage} />
      </Alert.Description>
    </Alert>
  );
}

/** PagerDutyActionForm picks the PagerDuty service an automation sends to and can send it a test event. */
export function PagerDutyActionForm({
  form,
  disabled,
  projectId,
}: {
  form: UseFormReturn<{ pagerDuty: { pagerDutyIntegrationId: string } }>;
  disabled: boolean;
  projectId: string;
}) {
  const { query } = usePagerDutyIntegrations(projectId);
  const integrations = query.data ?? [];
  const selectedId = form.watch("pagerDuty.pagerDutyIntegrationId");

  if (query.isSuccess && integrations.length === 0) {
    return <NoServicesAlert projectId={projectId} />;
  }

  return (
    <div className="space-y-4">
      <Form.Field
        control={form.control}
        name="pagerDuty.pagerDutyIntegrationId"
        label="PagerDuty service"
        description="Monitor alerts and project notifications trigger incidents on this service; a recovered monitor resolves its incident. Prompt changes are sent as change events, which never page anyone."
      >
        {(field) => (
          <div className="max-w-md">
            <SelectInput<string>
              id={field.id}
              value={field.value}
              onValueChange={field.onChange}
              disabled={disabled}
              placeholder="Select a PagerDuty service"
              options={integrations.map((integration) => ({
                value: integration.id,
                label: `${integration.name} (${integration.displayRoutingKey}, ${integration.region})`,
              }))}
              aria-describedby={field.inputDescribedById}
              error={!!field.error}
            />
          </div>
        )}
      </Form.Field>
      <PagerDutyTestEventButton
        projectId={projectId}
        pagerDutyIntegrationId={selectedId || undefined}
        disabled={disabled}
      />
    </div>
  );
}
