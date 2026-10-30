import { useId, type ReactNode } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { type ActionTypes } from "@langfuse/shared";
import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { DividedDialogBody } from "./components/DividedDialogBody";
import { GitHubDispatchActionFields } from "./components/GitHubDispatchActionFields";
import { PagerDutyActionFields } from "./components/PagerDutyActionFields";
import {
  SlackActionFields,
  type SlackFieldsState,
} from "./components/SlackActionFields";
import { WebhookActionFields } from "./components/WebhookActionFields";
import { isMonitorAutomationFormComplete } from "./helpers/isMonitorAutomationFormComplete";
import { serverErrorField } from "./helpers/serverErrorField";
import {
  defaultMonitorAutomationFormValues,
  monitorAutomationFormSchema,
  type MonitorAutomationFormValues,
} from "./helpers/monitorAutomationFormSchema";

const defaultActionType: ActionTypes = "SLACK";

/** monitorActionLabel names each action in the picker and the locked dialog title. */
const monitorActionLabel: Record<ActionTypes, string> = {
  SLACK: "Slack",
  WEBHOOK: "Webhook",
  GITHUB_DISPATCH: "GitHub dispatch",
  PAGERDUTY: "PagerDuty",
};

/** NewMonitorAutomationDialog collects a name and one action's fields for a new monitor automation. */
export function NewMonitorAutomationDialog({
  lockedActionType,
  actionTypes,
  slack,
  renderPagerDutyTestEvent,
  defaultValues,
  isSubmitting,
  onSubmit,
}: {
  /** lockedActionType hides the action picker and fixes the form to this action. */
  lockedActionType?: ActionTypes;
  actionTypes: ActionTypes[];
  slack: SlackFieldsState;
  renderPagerDutyTestEvent: (target: {
    routingKey: string;
    region: PagerDutyRegion;
  }) => ReactNode;
  defaultValues?: MonitorAutomationFormValues;
  isSubmitting: boolean;
  /** onSubmit resolves to the server's rejection, if any, which the form shows inline. */
  onSubmit: (
    values: MonitorAutomationFormValues,
  ) => Promise<MonitorAutomationSubmitResult>;
}) {
  const formId = useId();
  const form = useForm<MonitorAutomationFormValues>({
    resolver: zodResolver(monitorAutomationFormSchema),
    defaultValues:
      defaultValues ??
      defaultMonitorAutomationFormValues(lockedActionType ?? defaultActionType),
  });
  const values = useWatch({ control: form.control });
  const isComplete = isMonitorAutomationFormComplete(
    values as MonitorAutomationFormValues,
  );
  const rootError = form.formState.errors.root?.server?.message;
  const submit = async (submitted: MonitorAutomationFormValues) => {
    const { error } = await onSubmit(submitted);
    if (!error) return;
    form.setError(serverErrorField(submitted.actionType, error), {
      message: error,
    });
  };

  return (
    <Dialog
      title={dialogTitle(lockedActionType)}
      actions={[
        {
          label: "Create automation",
          type: "submit",
          form: formId,
          disabled: !isComplete || isSubmitting,
          loading: isSubmitting,
        },
      ]}
    >
      <DividedDialogBody>
        <Form
          id={formId}
          actions={[]}
          onSubmit={(event) => {
            // The dialog portals out of any surrounding form, but React still bubbles submit through it.
            event.stopPropagation();
            return form.handleSubmit(submit)(event);
          }}
        >
          <NameField form={form} />
          {!lockedActionType && (
            <ActionTypeField form={form} actionTypes={actionTypes} />
          )}
          <ActionFields
            form={form}
            actionType={form.watch("actionType")}
            slack={slack}
            renderPagerDutyTestEvent={renderPagerDutyTestEvent}
          />
          {rootError && <FormError message={rootError} />}
        </Form>
      </DividedDialogBody>
    </Dialog>
  );
}

/** FormError shows a rejection that concerns no single field. */
function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}

/** NameField is the automation name, shown on every alert it connects to. */
function NameField({ form }: { form: MonitorAutomationForm }) {
  return (
    <Form.Field
      control={form.control}
      name="name"
      label="Name"
      description="Can be connected to any alert in the project."
    >
      {(field) => (
        <Input
          id={field.id}
          name={field.name}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          placeholder="e.g. Staging alerts"
          aria-describedby={field.inputDescribedById}
          aria-invalid={!!field.error}
          error={!!field.error}
        />
      )}
    </Form.Field>
  );
}

/** ActionTypeField picks the action and clears the previous action's fields on change. */
function ActionTypeField({
  form,
  actionTypes,
}: {
  form: MonitorAutomationForm;
  actionTypes: ActionTypes[];
}) {
  return (
    <Form.Field control={form.control} name="actionType" label="Action">
      {(field) => (
        <SelectInput<ActionTypes>
          id={field.id}
          value={field.value}
          onValueChange={(actionType) =>
            form.reset(
              defaultMonitorAutomationFormValues(
                actionType,
                form.getValues("name"),
              ),
            )
          }
          options={actionTypes.map((actionType) => ({
            value: actionType,
            label: monitorActionLabel[actionType],
          }))}
          placeholder="Select an action"
          aria-describedby={field.inputDescribedById}
        />
      )}
    </Form.Field>
  );
}

/** ActionFields renders the fields of the selected action. */
function ActionFields({
  form,
  actionType,
  slack,
  renderPagerDutyTestEvent,
}: {
  form: MonitorAutomationForm;
  actionType: ActionTypes;
  slack: SlackFieldsState;
  renderPagerDutyTestEvent: (target: {
    routingKey: string;
    region: PagerDutyRegion;
  }) => ReactNode;
}) {
  switch (actionType) {
    case "SLACK":
      return <SlackActionFields form={form} slack={slack} />;
    case "WEBHOOK":
      return <WebhookActionFields form={form} />;
    case "GITHUB_DISPATCH":
      return <GitHubDispatchActionFields form={form} />;
    case "PAGERDUTY":
      return (
        <PagerDutyActionFields
          form={form}
          renderTestEvent={renderPagerDutyTestEvent}
        />
      );
  }
}

/** dialogTitle names the locked action, or the alert automation in general. */
function dialogTitle(lockedActionType: ActionTypes | undefined): string {
  if (!lockedActionType) return "New alert automation";
  return `New ${monitorActionLabel[lockedActionType]} automation`;
}

/** MonitorAutomationForm is the form state shared with the action field groups. */
type MonitorAutomationForm = UseFormReturn<MonitorAutomationFormValues>;

/** MonitorAutomationSubmitResult is the server's answer to a create; `error` is its rejection message. */
export type MonitorAutomationSubmitResult = { error?: string };
