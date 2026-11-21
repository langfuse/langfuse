import { type ComponentProps, type ReactNode, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  CreateQueueWithAssignmentsData,
  type CreateQueueWithAssignments,
} from "@langfuse/shared";

import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { Textarea } from "@/src/components/ui/textarea";
import { AnnotationQueueSessionViewSettings } from "./AnnotationQueueSessionViewSettings/AnnotationQueueSessionViewSettings";
import { UserAssignmentSection } from "./UserAssignmentSection";

type AnnotationQueueFormDialogContentProps = {
  mode: "create" | "edit";
  initialValues: CreateQueueWithAssignments;
  children: (control: {
    value: string[];
    onChange: (ids: string[]) => void;
  }) => ReactNode;
  sessionViewSettings: Pick<
    ComponentProps<typeof AnnotationQueueSessionViewSettings>,
    "viewsState" | "value" | "onChange" | "canSaveViews" | "onCreate" | "onEdit"
  > | null;
  userAssignments: Pick<
    ComponentProps<typeof UserAssignmentSection>,
    | "users"
    | "assignedUsers"
    | "totalAssignedUsers"
    | "searchQuery"
    | "onSearchChange"
    | "searchResults"
    | "isLoading"
    | "hasMoreResults"
    | "canWrite"
    | "isRemoving"
    | "onRemove"
  >;
  queueNames: string[];
  hasQueueAssignmentsReadAccess: boolean;
  isSubmitting: boolean;
  onSubmit: (data: CreateQueueWithAssignments) => void;
  submitLabel: string;
};

const queueFormSchema = CreateQueueWithAssignmentsData.extend({
  scoreConfigIds: z
    .array(z.string())
    .min(1, "Add or create at least one score config."),
});

export function AnnotationQueueFormDialogContent({
  mode,
  initialValues,
  children,
  sessionViewSettings,
  userAssignments,
  queueNames,
  hasQueueAssignmentsReadAccess,
  isSubmitting,
  onSubmit,
  submitLabel,
}: AnnotationQueueFormDialogContentProps) {
  const formId = useId();
  const form = useForm<CreateQueueWithAssignments>({
    resolver: zodResolver(
      (mode === "create"
        ? queueFormSchema
        : CreateQueueWithAssignmentsData.extend({
            scoreConfigIds: z.array(z.string()),
          })
      ).superRefine((values, context) => {
        if (
          queueNames.includes(values.name) &&
          !(mode === "edit" && values.name === initialValues.name)
        ) {
          context.addIssue({
            code: "custom",
            path: ["name"],
            message: "Queue name already exists.",
          });
        }
      }),
    ),
    defaultValues: initialValues,
    mode: "onChange",
  });
  const handleScoreConfigValueChange = (values: string[]) => {
    form.setValue("scoreConfigIds", values, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
  return (
    <Dialog
      stopPropagationOnEnterSpace={false}
      title={mode === "edit" ? "Queue settings" : "New annotation queue"}
      actions={[
        {
          label: submitLabel,
          type: "submit",
          form: formId,
          disabled: !!form.formState.errors.name,
          loading: isSubmitting,
        },
      ]}
    >
      <Dialog.Body>
        <Form
          id={formId}
          actions={[]}
          onSubmit={form.handleSubmit((data) =>
            onSubmit({
              ...data,
              sessionViewId: sessionViewSettings
                ? sessionViewSettings.value
                : initialValues.sessionViewId,
            }),
          )}
        >
          <Form.Field control={form.control} name="name" label="Name">
            {(field) => (
              <Input
                id={field.id}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={(event) => {
                  field.onChange(event.target.value.trimEnd());
                  field.onBlur();
                }}
                ref={field.ref}
                type="text"
                aria-describedby={field.inputDescribedById}
                aria-invalid={!!field.error}
                error={!!field.error}
              />
            )}
          </Form.Field>
          <Form.Field
            control={form.control}
            name="description"
            label="Description (optional)"
          >
            {(field) => (
              <Textarea
                id={field.id}
                name={field.name}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                placeholder="Add description..."
                aria-describedby={field.inputDescribedById}
                aria-invalid={!!field.error}
              />
            )}
          </Form.Field>
          {mode === "create" && (
            <Form.Field
              control={form.control}
              name="scoreConfigIds"
              label="Score configs"
              description="Choose the fields annotators will fill in."
            >
              {(field) => (
                <div>
                  {children({
                    value: field.value,
                    onChange: handleScoreConfigValueChange,
                  })}
                </div>
              )}
            </Form.Field>
          )}
          {sessionViewSettings && (
            <AnnotationQueueSessionViewSettings
              {...sessionViewSettings}
              disabled={isSubmitting}
            />
          )}
          {hasQueueAssignmentsReadAccess ? (
            <Controller
              control={form.control}
              name="newAssignmentUserIds"
              render={({ field }) => (
                <Accordion type="single" collapsible>
                  <Accordion.Item value="assignments">
                    <Accordion.Trigger size="sm">
                      User assignments
                    </Accordion.Trigger>
                    <Accordion.Content>
                      <div className="py-3">
                        <UserAssignmentSection
                          {...userAssignments}
                          selectedUserIds={field.value}
                          onChange={field.onChange}
                        />
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion>
              )}
            />
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
