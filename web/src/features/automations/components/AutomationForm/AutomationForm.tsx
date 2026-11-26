import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Form } from "@/src/components/design-system/Form/Form";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Button } from "@/src/components/design-system/Button/Button";
import { Separator } from "@/src/components/ui/separator";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import type { ComponentProps, ReactNode } from "react";
import type { Control } from "react-hook-form";
import { TriggerEventSource, type ActionTypes } from "@langfuse/shared";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { MultiSelect } from "@/src/features/filters/components/MultiSelect";
import { actionTypeLabel } from "@/src/features/automations/actionTypeLabels";
import type { FormValues } from "../ConnectedAutomationForm";

export function AutomationForm({
  control,
  isEditing,
  showNameAndStatus,
  autoFocusName,
  fieldsDisabled,
  availableActionTypes,
  trigger,
  renderActionFields,
  deleteAction,
  submitButtonText,
  submitDisabled,
  onActionTypeChange,
  onCancel,
  onSubmit,
}: {
  control: Control<FormValues>;
  isEditing: boolean;
  showNameAndStatus: boolean;
  autoFocusName: boolean;
  fieldsDisabled: boolean;
  availableActionTypes: ActionTypes[];
  trigger: {
    sourcePicker: {
      showMonitor: boolean;
      onSourceChange: (value: TriggerEventSource) => void;
    } | null;
    details:
      | { kind: "monitor"; projectId: string }
      | (Pick<
          ComponentProps<typeof VersionTriggerFields>,
          "eventSource" | "columns" | "optionsLoading" | "onOptionsOpen"
        > & { kind: "version" });
  } | null;
  renderActionFields: (props: { disabled: boolean }) => ReactNode;
  deleteAction: { disabled: boolean; onDelete: () => void } | null;
  submitButtonText: string;
  submitDisabled: boolean;
  onActionTypeChange: (value: ActionTypes) => void;
  onCancel: () => void;
  onSubmit: NonNullable<ComponentProps<"form">["onSubmit"]>;
}) {
  return (
    <form
      // Keep validation in the resolver and action handler for design-system fields.
      noValidate
      onSubmit={onSubmit}
      className="space-y-6 pb-6"
    >
      {showNameAndStatus && (
        <div className="mb-6 flex items-center gap-4">
          <div className="flex-1">
            <Form.InputField
              control={control}
              name="name"
              label="Automation name"
              placeholder="Automation name"
              required
              autoFocus={autoFocusName}
              disabled={fieldsDisabled}
            />
          </div>
          <Form.Field control={control} name="status" label="Active">
            {(field) => (
              <Switch
                id={field.id}
                ref={field.ref}
                onBlur={field.onBlur}
                aria-describedby={field.inputDescribedById}
                aria-invalid={Boolean(field.error)}
                checked={field.value === "ACTIVE"}
                onCheckedChange={(checked) =>
                  field.onChange(checked ? "ACTIVE" : "INACTIVE")
                }
                disabled={fieldsDisabled}
              />
            )}
          </Form.Field>
        </div>
      )}

      {trigger && (
        <Card>
          <CardHeader>
            <CardTitle>Trigger</CardTitle>
            <CardDescription>
              Configure when this automation should run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {trigger.sourcePicker && (
              <Form.Field
                control={control}
                name="eventSource"
                label="Event source"
                description="The event that triggers this automation."
              >
                {(field) => (
                  <SelectInput<TriggerEventSource | "planned">
                    id={field.id}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    aria-describedby={field.inputDescribedById}
                    aria-invalid={Boolean(field.error)}
                    error={Boolean(field.error)}
                    onValueChange={(value) => {
                      if (value !== "planned") {
                        trigger.sourcePicker?.onSourceChange(value);
                      }
                    }}
                    value={field.value}
                    disabled={fieldsDisabled}
                    placeholder="Select an event source"
                    options={[
                      { value: TriggerEventSource.Prompt, label: "Prompt" },
                      { value: TriggerEventSource.Skill, label: "Skill" },
                      ...(trigger.sourcePicker?.showMonitor
                        ? [
                            {
                              value: TriggerEventSource.Monitor,
                              label: "Alert",
                            },
                          ]
                        : []),
                      {
                        value: "planned",
                        label: "More coming soon...",
                        disabled: true,
                        disabledReason:
                          "Additional event sources are not available yet.",
                      },
                    ]}
                  />
                )}
              </Form.Field>
            )}
            {trigger.details.kind === "monitor" ? (
              <Banner
                title="How alerts connect"
                actions={[
                  {
                    text: "Create alerts page",
                    href: `/project/${trigger.details.projectId}/alerts/new`,
                  },
                ]}
              >
                Add this automation to an alert from the create alerts page.
              </Banner>
            ) : (
              <VersionTriggerFields
                key={trigger.details.eventSource}
                eventSource={trigger.details.eventSource}
                control={control}
                disabled={fieldsDisabled}
                columns={trigger.details.columns}
                optionsLoading={trigger.details.optionsLoading}
                onOptionsOpen={trigger.details.onOptionsOpen}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Action</CardTitle>
          <CardDescription>
            Configure what happens when the trigger fires.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form.Field
            control={control}
            name="actionType"
            label="Action type"
            description="The type of action to perform when the trigger fires."
          >
            {(field) => (
              <SelectInput<ActionTypes | "planned">
                id={field.id}
                ref={field.ref}
                onBlur={field.onBlur}
                aria-describedby={field.inputDescribedById}
                aria-invalid={Boolean(field.error)}
                error={Boolean(field.error)}
                onValueChange={(value) => {
                  if (value !== "planned") onActionTypeChange(value);
                }}
                value={field.value}
                disabled={fieldsDisabled}
                placeholder="Select an action type"
                options={[
                  ...availableActionTypes.map((actionType) => ({
                    value: actionType,
                    label: actionTypeLabel[actionType],
                  })),
                  {
                    value: "planned",
                    label: "More coming soon...",
                    disabled: true,
                    disabledReason:
                      "Additional action types are not available yet.",
                  },
                ]}
              />
            )}
          </Form.Field>

          <Separator className="my-4" />

          {renderActionFields({ disabled: fieldsDisabled })}
        </CardContent>
      </Card>

      {isEditing && (
        <div className="flex justify-between gap-3">
          {deleteAction && (
            <Button
              text="Delete"
              variant="destructive"
              disabled={deleteAction.disabled}
              onClick={deleteAction.onDelete}
            />
          )}
          <div className="grow"></div>
          <div className="flex gap-3">
            <Button text="Cancel" variant="outline" onClick={onCancel} />
            <Button
              text={submitButtonText}
              type="submit"
              disabled={submitDisabled}
            />
          </div>
        </div>
      )}
    </form>
  );
}

function VersionTriggerFields({
  eventSource,
  control,
  disabled,
  columns,
  optionsLoading,
  onOptionsOpen,
}: {
  eventSource: TriggerEventSource;
  control: Control<FormValues>;
  disabled: boolean;
  columns: ComponentProps<typeof InlineFilterBuilder>["columns"];
  optionsLoading: boolean;
  onOptionsOpen: () => void;
}) {
  const resource =
    eventSource === TriggerEventSource.Skill ? "skill" : "prompt";

  return (
    <>
      <Form.Field
        control={control}
        name="eventAction"
        label="Event action"
        description="The actions on the event source that trigger this automation."
      >
        {(field) => (
          <div
            role="group"
            aria-label="Event action"
            aria-describedby={field.inputDescribedById}
          >
            <MultiSelect
              title="Event actions"
              label="Actions"
              values={field.value}
              onValueChange={field.onChange}
              options={[
                {
                  value: "created",
                  description: `Whenever a new ${resource} version is created`,
                },
                {
                  value: "updated",
                  description: `Whenever tags or labels on a ${resource} version are updated`,
                },
                {
                  value: "deleted",
                  description: `Whenever a ${resource} version is deleted`,
                },
              ]}
              className="my-0 w-auto overflow-hidden"
              disabled={disabled}
              labelTruncateCutOff={4}
            />
          </div>
        )}
      </Form.Field>
      <Form.Field
        control={control}
        name="filter"
        label="Filter"
        description="Add conditions to narrow down when this trigger fires."
      >
        {(field) => (
          <div
            role="group"
            aria-label="Filter"
            aria-describedby={field.inputDescribedById}
          >
            <InlineFilterBuilder
              columns={columns}
              columnsWithCustomSelect={["labels", "tags"]}
              loadingOptionColumns={optionsLoading ? ["labels", "tags"] : []}
              onOptionsOpen={(columnId) => {
                if (columnId === "labels" || columnId === "tags") {
                  onOptionsOpen();
                }
              }}
              filterState={field.value || []}
              onChange={field.onChange}
              disabled={disabled}
            />
          </div>
        )}
      </Form.Field>
    </>
  );
}
