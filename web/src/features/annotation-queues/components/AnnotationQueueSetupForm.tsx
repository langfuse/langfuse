import { type ReactNode, useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Info } from "lucide-react";
import { z } from "zod";
import { CreateQueueWithAssignmentsData } from "@langfuse/shared";

import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { Textarea } from "@/src/components/ui/textarea";

const setupSchema = CreateQueueWithAssignmentsData.extend({
  description: CreateQueueWithAssignmentsData.shape.description.unwrap(),
  scoreConfigIds: z.array(z.string()),
});

export type AnnotationQueueSetupValues = z.infer<typeof setupSchema>;
export type AnnotationQueueSetupDirtyFields = Record<
  keyof AnnotationQueueSetupValues,
  boolean
>;

type SelectionControl = {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
};

type AnnotationQueueSetupFormProps = {
  initialValues: AnnotationQueueSetupValues;
  queueNames: string[];
  canEdit: boolean;
  isSubmitting: boolean;
  hasAssignments: boolean;
  onSubmit: (
    values: AnnotationQueueSetupValues,
    dirtyFields: AnnotationQueueSetupDirtyFields,
  ) => Promise<void>;
  children: (control: SelectionControl) => ReactNode;
  renderAssignments: (control: SelectionControl) => ReactNode;
  renderLayout: (content: ReactNode) => ReactNode;
};

function sameIds(
  left: readonly string[],
  right: readonly (string | undefined)[],
) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

export function AnnotationQueueSetupForm({
  initialValues,
  queueNames,
  canEdit,
  isSubmitting,
  hasAssignments,
  onSubmit,
  children,
  renderAssignments,
  renderLayout,
}: AnnotationQueueSetupFormProps) {
  const formId = useId();
  const [saveFailed, setSaveFailed] = useState(false);
  const form = useForm<AnnotationQueueSetupValues>({
    defaultValues: initialValues,
    resolver: zodResolver(
      setupSchema.superRefine((values, context) => {
        if (queueNames.includes(values.name)) {
          context.addIssue({
            code: "custom",
            path: ["name"],
            message: "Queue name already exists.",
          });
        }
      }),
    ),
    mode: "onChange",
  });
  const selectedIds = useWatch({
    control: form.control,
    name: "scoreConfigIds",
  });
  const {
    defaultValues: defaults,
    isDirty,
    isValid,
    isSubmitting: formIsSubmitting,
  } = form.formState;
  const missingScoreConfigs =
    selectedIds.length === 0 &&
    !sameIds(selectedIds, defaults?.scoreConfigIds ?? []);
  const submitting = isSubmitting || formIsSubmitting;
  const disabled = !canEdit || submitting;

  const submit = form.handleSubmit(async (values) => {
    if (!canEdit || missingScoreConfigs) return;
    setSaveFailed(false);
    const dirtyFields: AnnotationQueueSetupDirtyFields = {
      name: values.name !== defaults?.name,
      description: values.description !== defaults?.description,
      scoreConfigIds: !sameIds(
        values.scoreConfigIds,
        defaults?.scoreConfigIds ?? [],
      ),
      newAssignmentUserIds: !sameIds(
        values.newAssignmentUserIds,
        defaults?.newAssignmentUserIds ?? [],
      ),
    };
    try {
      await onSubmit(values, dirtyFields);
      form.reset({ ...values, newAssignmentUserIds: [] });
    } catch {
      setSaveFailed(true);
    }
  });

  return renderLayout(
    <div className="isolate flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Form
          id={formId}
          density="compact"
          actions={[]}
          onSubmit={(event) => {
            if (event.target !== event.currentTarget) return;
            event.stopPropagation();
            return submit(event);
          }}
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
                disabled={disabled}
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
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                disabled={disabled}
                rows={3}
                aria-describedby={field.inputDescribedById}
                aria-invalid={!!field.error}
              />
            )}
          </Form.Field>
          <section
            className="flex flex-col gap-3"
            aria-labelledby={`${formId}-scores`}
          >
            <div className="flex items-center gap-1">
              <h3 id={`${formId}-scores`} className="text-sm font-bold">
                Scores to annotate
              </h3>
              <Tooltip label="Score configs define the fields annotators see. Adding or removing fields applies when items are reopened, including completed items. Historical scores and completion status stay unchanged. Editing a score config changes its project-wide definition for future scoring wherever it is used.">
                {({ getTriggerProps }) => (
                  <IconButton
                    {...getTriggerProps()}
                    icon={Info}
                    label="About scores to annotate"
                    size="sm"
                  />
                )}
              </Tooltip>
            </div>
            <Controller
              control={form.control}
              name="scoreConfigIds"
              render={({ field }) => (
                <div>
                  {children({
                    value: field.value,
                    onChange: (ids) =>
                      form.setValue("scoreConfigIds", ids, {
                        shouldDirty: true,
                        shouldValidate: true,
                      }),
                    disabled,
                  })}
                </div>
              )}
            />
            {missingScoreConfigs ? (
              <p role="alert" className="text-destructive text-sm">
                Add at least one score config before saving.
              </p>
            ) : null}
          </section>
          {hasAssignments ? (
            <Accordion type="single" collapsible>
              <Accordion.Item value="assignments">
                <Accordion.Trigger size="sm">User assignment</Accordion.Trigger>
                <Accordion.Content>
                  <Controller
                    control={form.control}
                    name="newAssignmentUserIds"
                    render={({ field }) => (
                      <fieldset disabled={disabled} className="min-w-0 py-3">
                        {renderAssignments({
                          value: field.value,
                          onChange: field.onChange,
                          disabled,
                        })}
                      </fieldset>
                    )}
                  />
                </Accordion.Content>
              </Accordion.Item>
            </Accordion>
          ) : null}
        </Form>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t p-3">
        {saveFailed ? (
          <p role="alert" className="text-destructive text-sm">
            Could not save queue setup. Your changes are still here. Try again.
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            text="Save changes"
            type="submit"
            form={formId}
            loading={submitting}
            disabled={disabled || !isDirty || !isValid || missingScoreConfigs}
          />
          <Button
            text="Discard"
            variant="secondary"
            disabled={disabled || !isDirty}
            onClick={() => {
              form.reset(initialValues);
              setSaveFailed(false);
            }}
          />
        </div>
      </div>
    </div>,
  );
}
