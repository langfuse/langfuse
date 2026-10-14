import { type ReactNode, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Settings2 } from "lucide-react";
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
  onManageScoreConfigsClick: () => void;
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
  onManageScoreConfigsClick,
  hasQueueAssignmentsReadAccess,
  isSubmitting,
  onSubmit,
  submitLabel,
}: AnnotationQueueFormDialogContentProps) {
  const formId = useId();
  const form = useForm<CreateQueueWithAssignments>({
    resolver: zodResolver(
      queueFormSchema.superRefine((values, context) => {
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
  const scoreConfigDescription =
    "Fields appear in the order above. Use the arrows to reorder them without changing existing scores. Score config definitions are project-wide. Editing one can affect future scoring in other queues and through the API/SDK." +
    (mode === "edit"
      ? " Adding or removing fields takes effect when items are reopened, including completed items. Completion status and historical scores stay unchanged."
      : "");
  return (
    <Dialog
      title={mode === "edit" ? "Edit annotation queue" : "New annotation queue"}
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
        <p className="text-muted-foreground">
          {mode === "edit"
            ? "Edit your queue and the fields annotators see."
            : "Name your queue, then add or create its annotation fields."}
        </p>
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
          <Form.Field
            control={form.control}
            name="scoreConfigIds"
            label="Score configs"
            description={scoreConfigDescription}
          >
            {(field) => (
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  A score config defines a field humans fill in; each answer is
                  saved as a score on that item. Add an existing score config or
                  create one here.
                </p>
                <div className="flex justify-end">
                  <Button
                    text="Manage score configs"
                    href={`/project/${projectId}/settings/scores`}
                    target="_blank"
                    variant="secondary"
                    size="sm"
                    icon={Settings2}
                    onClick={onManageScoreConfigsClick}
                    onAuxClick={(event) => {
                      if (event.button === 1) onManageScoreConfigsClick();
                    }}
                  />
                </div>
                {children({
                  value: field.value,
                  onChange: handleScoreConfigValueChange,
                })}
              </div>
            )}
          </Form.Field>
          {hasQueueAssignmentsReadAccess ? (
            <Form.Field
              control={form.control}
              name="newAssignmentUserIds"
              label="Advanced Settings"
            >
              {(field) => (
                <Accordion type="single" collapsible>
                  <Accordion.Item value="assignments">
                    <Accordion.Trigger size="sm">
                      User Assignment
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
            </Form.Field>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
