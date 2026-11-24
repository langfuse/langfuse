import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Form } from "@/src/components/design-system/Form/Form";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import type { FormEventHandler, ReactNode } from "react";
import type { Control } from "react-hook-form";
import type { ActionTypes } from "@langfuse/shared";
import { actionTypeLabel } from "@/src/features/automations/actionTypeLabels";
import type { FormValues } from "./ConnectedAutomationForm";

export function AutomationForm({
  control,
  isEditing,
  showNameAndStatus,
  autoFocusName,
  fieldsDisabled,
  availableActionTypes,
  triggerSection,
  actionFields,
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
  triggerSection: ReactNode;
  actionFields: ReactNode;
  deleteAction: ReactNode;
  submitButtonText: string;
  submitDisabled: boolean;
  onActionTypeChange: (value: ActionTypes) => void;
  onCancel: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
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
              label="Automation Name"
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

      {triggerSection && (
        <Card>
          <CardHeader>
            <CardTitle>Trigger</CardTitle>
            <CardDescription>
              Configure when this automation should run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">{triggerSection}</CardContent>
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
            label="Action Type"
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

          {actionFields}
        </CardContent>
      </Card>

      {isEditing && (
        <div className="flex justify-between gap-3">
          {deleteAction}
          <div className="grow"></div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {submitButtonText}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
