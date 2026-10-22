import { type ReactNode, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  CreateQueueWithAssignmentsData,
  type CreateQueueWithAssignments,
} from "@langfuse/shared";

import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { Textarea } from "@/src/components/ui/textarea";
import { UserAssignmentSection } from "@/src/features/annotation-queues/components/UserAssignmentSection";
import { ConnectedAnnotationQueueSessionViewSettings } from "./ConnectedAnnotationQueueSessionViewSettings";
import { ConnectedAnnotationQueueSessionViewDialogController } from "./ConnectedAnnotationQueueSessionViewDialogController";

type AnnotationQueueFormDialogContentProps = {
  mode: "create" | "edit";
  initialValues: CreateQueueWithAssignments;
  children: (control: {
    value: string[];
    onChange: (ids: string[]) => void;
  }) => ReactNode;
  projectId: string;
  queueId?: string;
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
  projectId,
  queueId,
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
        <Form id={formId} actions={[]} onSubmit={form.handleSubmit(onSubmit)}>
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
          <Controller
            control={form.control}
            name="sessionViewId"
            render={({ field }) => (
              <ConnectedAnnotationQueueSessionViewDialogController
                projectId={projectId}
                onChange={field.onChange}
                disabled={isSubmitting}
              >
                {({ openDialog }) => (
                  <ConnectedAnnotationQueueSessionViewSettings
                    projectId={projectId}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    disabled={isSubmitting}
                  >
                    {({ selectedView, canReadViews, canSaveViews }) => (
                      <>
                        <Button
                          text="Create view"
                          variant="secondary"
                          disabled={
                            isSubmitting || !canSaveViews || !canReadViews
                          }
                          onClick={() => openDialog({ type: "create" })}
                        />
                        {selectedView && (
                          <Button
                            text="Edit view"
                            variant="ghost"
                            disabled={
                              isSubmitting ||
                              !canSaveViews ||
                              !selectedView.canEdit
                            }
                            onClick={() =>
                              openDialog({ type: "edit", view: selectedView })
                            }
                          />
                        )}
                      </>
                    )}
                  </ConnectedAnnotationQueueSessionViewSettings>
                )}
              </ConnectedAnnotationQueueSessionViewDialogController>
            )}
          />
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
                          projectId={projectId}
                          queueId={queueId}
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
