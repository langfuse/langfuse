import { type ReactNode, useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { CreateQueueWithAssignmentsData } from "@langfuse/shared";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { Textarea } from "@/src/components/ui/textarea";

const setupSchema = CreateQueueWithAssignmentsData.extend({
  name: z.string(),
  description: z.string(),
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
  const [activeTab, setActiveTab] = useState("settings");
  const form = useForm<AnnotationQueueSetupValues>({
    defaultValues: initialValues,
    resolver: zodResolver(
      setupSchema.superRefine((values, context) => {
        // Existing API-created metadata can exceed the UI creation limits.
        for (const key of ["name", "description"] as const) {
          if (values[key] === initialValues[key]) continue;
          const result = CreateQueueWithAssignmentsData.shape[key].safeParse(
            values[key],
          );
          if (!result.success) {
            for (const issue of result.error.issues) {
              context.addIssue({ ...issue, path: [key, ...issue.path] });
            }
          }
        }
        if (
          values.name !== initialValues.name &&
          queueNames.includes(values.name)
        ) {
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
      <Tabs value={activeTab} onValueChange={setActiveTab} layout="fill">
        <div className="shrink-0 px-3">
          <Tabs.List variant="underline" layout="full" aria-label="Queue setup">
            <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
            <Tabs.Trigger value="annotation">Annotation panel</Tabs.Trigger>
          </Tabs.List>
        </div>
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
            <Tabs.Content value="settings">
              <div className="flex flex-col gap-4">
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
                {hasAssignments && (
                  <section
                    className="flex flex-col gap-3"
                    aria-labelledby={`${formId}-assignments`}
                  >
                    <h3
                      id={`${formId}-assignments`}
                      className="text-sm font-bold"
                    >
                      User assignment
                    </h3>
                    <Controller
                      control={form.control}
                      name="newAssignmentUserIds"
                      render={({ field }) => (
                        <fieldset disabled={disabled} className="min-w-0">
                          {renderAssignments({
                            value: field.value,
                            onChange: field.onChange,
                            disabled,
                          })}
                        </fieldset>
                      )}
                    />
                  </section>
                )}
              </div>
            </Tabs.Content>
            <Tabs.Content value="annotation">
              <section
                className="flex flex-col gap-3"
                aria-label="Queue score configs"
              >
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Choose and arrange the score configs annotators fill out for
                  items in this queue.
                </p>
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
            </Tabs.Content>
          </Form>
        </div>
      </Tabs>
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
