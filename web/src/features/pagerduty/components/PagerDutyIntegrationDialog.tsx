import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { type PagerDutyRegion } from "@langfuse/shared";
import {
  PagerDutyIntegrationNameSchema,
  PagerDutyRegionSchema,
  PagerDutyRoutingKeySchema,
  type PagerDutyIntegrationListItem,
} from "@langfuse/shared/pagerduty";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

const regionOptions: { value: PagerDutyRegion; label: string }[] = [
  { value: "US", label: "US (events.pagerduty.com)" },
  { value: "EU", label: "EU (events.eu.pagerduty.com)" },
];

/** useSaveIntegration creates or updates the routing key and closes the dialog on success. */
function useSaveIntegration({
  projectId,
  integration,
  onSaved,
}: {
  projectId: string;
  integration: PagerDutyIntegrationListItem | null;
  onSaved: () => void;
}) {
  const utils = api.useUtils();
  const onSuccess = async () => {
    await utils.pagerDuty.list.invalidate({ projectId });
    showSuccessToast({
      operation: "pagerDuty.create",
      title: "PagerDuty service saved",
      description: "The routing key is ready to use in automations.",
    });
    onSaved();
  };
  const create = api.pagerDuty.create.useMutation({ onSuccess });
  const update = api.pagerDuty.update.useMutation({ onSuccess });

  const save = (values: FormValues) => {
    const routingKey = values.routingKey || undefined;
    if (integration) {
      update.mutate({
        projectId,
        id: integration.id,
        name: values.name,
        region: values.region,
        routingKey,
      });
      return;
    }
    create.mutate({
      projectId,
      name: values.name,
      region: values.region,
      routingKey: values.routingKey,
    });
  };

  return { save, isPending: create.isPending || update.isPending };
}

/** buildFormSchema requires a routing key on create and keeps the stored one when left empty on edit. */
function buildFormSchema(isEdit: boolean) {
  if (isEdit) {
    return z.object({
      name: PagerDutyIntegrationNameSchema,
      routingKey: z.union([z.literal(""), PagerDutyRoutingKeySchema]),
      region: PagerDutyRegionSchema,
    });
  }
  return z.object({
    name: PagerDutyIntegrationNameSchema,
    routingKey: PagerDutyRoutingKeySchema,
    region: PagerDutyRegionSchema,
  });
}

/** dialogTitle names the dialog for adding or editing. */
function dialogTitle(isEdit: boolean): string {
  if (isEdit) return "Edit PagerDuty service";
  return "Add PagerDuty service";
}

/** routingKeyDescription explains where the key comes from, and that an empty field keeps the stored key. */
function routingKeyDescription(
  integration: PagerDutyIntegrationListItem | null,
): string {
  const source =
    "The integration key of an Events API v2 integration on a service, or an Event Orchestration routing key.";
  if (!integration) return source;
  return `${source} Leave empty to keep ${integration.displayRoutingKey}.`;
}

/** PagerDutyIntegrationDialog adds a routing key, or renames, rotates or re-regions an existing one. */
export function PagerDutyIntegrationDialog({
  projectId,
  integration,
  closeDialog,
}: {
  projectId: string;
  integration: PagerDutyIntegrationListItem | null;
  closeDialog: () => void;
}) {
  const formId = useId();
  const isEdit = integration !== null;
  const form = useForm<FormValues>({
    resolver: zodResolver(buildFormSchema(isEdit)),
    defaultValues: {
      name: integration?.name ?? "",
      routingKey: "",
      region: integration?.region ?? "US",
    },
  });
  const { save, isPending } = useSaveIntegration({
    projectId,
    integration,
    onSaved: closeDialog,
  });

  return (
    <Dialog
      stopPropagationOnEnterSpace={false}
      title={dialogTitle(isEdit)}
      actions={[
        { label: "Save", type: "submit", form: formId, loading: isPending },
      ]}
    >
      <Dialog.Body>
        <Form id={formId} actions={[]} onSubmit={form.handleSubmit(save)}>
          <Form.Field
            control={form.control}
            name="name"
            label="Name"
            description="Shown when you pick this service in an automation."
          >
            {(field) => (
              <Input
                id={field.id}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                placeholder="LLM production on-call"
                aria-describedby={field.inputDescribedById}
                aria-invalid={!!field.error}
                error={!!field.error}
              />
            )}
          </Form.Field>
          <Form.Field
            control={form.control}
            name="routingKey"
            label="Routing key"
            description={routingKeyDescription(integration)}
          >
            {(field) => (
              <PasswordInput
                id={field.id}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                placeholder={integration?.displayRoutingKey ?? "32 characters"}
                aria-describedby={field.inputDescribedById}
                aria-invalid={!!field.error}
                error={!!field.error}
              />
            )}
          </Form.Field>
          <Form.Field
            control={form.control}
            name="region"
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
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}

/** FormValues are the dialog's form fields. */
type FormValues = {
  name: string;
  routingKey: string;
  region: PagerDutyRegion;
};
