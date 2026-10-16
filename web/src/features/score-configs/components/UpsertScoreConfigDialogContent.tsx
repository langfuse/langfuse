/* eslint-disable no-nested-ternary */
import { zodResolver } from "@hookform/resolvers/zod";
import { ScoreDataTypeEnum, type ScoreConfigDataType } from "@langfuse/shared";
import { useId, useState } from "react";
import { type UseFormReturn, useFieldArray, useForm } from "react-hook-form";

import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/design-system/Input/Input";
import { Textarea } from "@/src/components/ui/textarea";
import DocPopup from "@/src/components/layouts/doc-popup";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
  isTextDataType,
} from "@/src/features/scores";
import {
  createConfigSchema,
  type CreateConfig,
  type UpdateConfig,
  updateConfigSchema,
} from "@/src/features/score-configs/lib/upsertFormTypes";
import { validateScoreConfigUpsertFormInput } from "@/src/features/score-configs/lib/validateScoreConfigUpsertFormInput";
import { Trash } from "lucide-react";

type SharedUpsertScoreConfigDialogContentProps = {
  onSubmit: (values: CreateConfig | UpdateConfig) => Promise<void>;
  onFormSuccess: () => void;
  isSubmitting: boolean;
};

export type UpsertScoreConfigDialogContentProps =
  | (SharedUpsertScoreConfigDialogContentProps & {
      mode: "create";
      defaultValues: CreateConfig;
    })
  | (SharedUpsertScoreConfigDialogContentProps & {
      mode: "edit";
      defaultValues: UpdateConfig;
    });

export function UpsertScoreConfigDialogContent({
  mode,
  defaultValues,
  onSubmit,
  onFormSuccess,
  isSubmitting,
}: UpsertScoreConfigDialogContentProps) {
  const formId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(
      mode === "edit" ? updateConfigSchema : createConfigSchema,
    ),
    defaultValues,
  }) as UseFormReturn<CreateConfig | UpdateConfig>;

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "categories",
  });
  const dataType = form.watch("dataType");

  async function handleSubmit(values: CreateConfig | UpdateConfig) {
    const error = validateScoreConfigUpsertFormInput(values);
    setFormError(error);
    if (error) return;

    try {
      await onSubmit(values);
      form.reset();
      onFormSuccess();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "An error occurred while submitting config.",
      );
    }
  }

  return (
    <Dialog
      title={mode === "edit" ? "Update score config" : "Add new score config"}
      actions={[
        {
          label: "Submit",
          type: "submit",
          form: formId,
          loading: isSubmitting,
        },
      ]}
    >
      <Form {...form}>
        <form
          id={formId}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(handleSubmit)(event);
          }}
        >
          <Dialog.Body>
            <p className="text-muted-foreground">
              {mode === "edit"
                ? "This score config is project-wide. Changes affect future scoring wherever it is used, including other queues and API/SDK scores. Data type cannot be changed after creation."
                : "Create a project-wide score config for annotation and API/SDK scoring."}
            </p>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      onBlur={(e) => field.onChange(e.target.value.trimEnd())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dataType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data type</FormLabel>
                  <FormControl>
                    <SelectInput
                      disabled={mode === "edit"}
                      value={field.value}
                      onValueChange={(value) => {
                        const nextDataType = value as ScoreConfigDataType;
                        field.onChange(nextDataType);
                        form.clearErrors();
                        if (isNumericDataType(nextDataType)) {
                          form.setValue("categories", undefined);
                        } else if (isTextDataType(nextDataType)) {
                          form.setValue("categories", undefined);
                          form.setValue("minValue", undefined);
                          form.setValue("maxValue", undefined);
                        } else {
                          form.setValue("minValue", undefined);
                          form.setValue("maxValue", undefined);
                          if (isBooleanDataType(nextDataType)) {
                            replace([
                              { label: "True", value: 1 },
                              { label: "False", value: 0 },
                            ]);
                          } else {
                            replace([{ label: "", value: 0 }]);
                          }
                        }
                      }}
                      placeholder="Select a data type"
                      options={Object.values(ScoreDataTypeEnum)
                        .filter((value) => value !== "CORRECTION")
                        .map((value) => ({ value, label: value }))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isNumericDataType(dataType) ? (
              <>
                <FormField
                  control={form.control}
                  name="minValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum (optional) </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(
                              value === "" ? undefined : Number(value),
                            );
                          }}
                          type="number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum (optional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(
                              value === "" ? undefined : Number(value),
                            );
                          }}
                          type="number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : isTextDataType(dataType) ? null : (
              <div className="grid grid-flow-row gap-2">
                <FormField
                  control={form.control}
                  name="categories"
                  render={() => (
                    <>
                      {fields.length > 0 && (
                        <div className="mb-2 grid grid-cols-[1fr_3fr] items-center gap-2 text-left sm:grid-cols-[1fr_7fr]">
                          <FormLabel className="grid grid-flow-col">
                            Value
                            <DocPopup
                              description={`This is how the ${
                                isCategoricalDataType(dataType)
                                  ? "category"
                                  : "boolean"
                              } label is mapped to an integer value internally.`}
                            />
                          </FormLabel>
                          <FormLabel>Label</FormLabel>
                        </div>
                      )}
                      {fields.map((category, index) => (
                        <div
                          key={`${category.id}-langfuseObject`}
                          className="mb-2 grid grid-cols-[1fr_3fr] gap-2 text-left sm:grid-cols-[1fr_7fr]"
                        >
                          <FormField
                            control={form.control}
                            name={`categories.${index}.value`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    {...field}
                                    readOnly
                                    disabled
                                    inputMode="numeric"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-[1fr_auto] gap-2">
                            <FormField
                              control={form.control}
                              name={`categories.${index}.label`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="text"
                                      onBlur={(e) =>
                                        field.onChange(e.target.value.trimEnd())
                                      }
                                      readOnly={isBooleanDataType(dataType)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            {isCategoricalDataType(dataType) && (
                              <IconButton
                                icon={Trash}
                                label={`Remove category ${index + 1}`}
                                onClick={() => remove(index)}
                                disabled={
                                  index === 0 || index !== fields.length - 1
                                }
                              />
                            )}
                          </div>
                        </div>
                      ))}
                      {isCategoricalDataType(dataType) && (
                        <div className="grid">
                          <Button
                            type="button"
                            text="Add category"
                            variant="secondary"
                            disabled={
                              isBooleanDataType(dataType) && fields.length === 2
                            }
                            onClick={() =>
                              append({
                                label: "",
                                value:
                                  fields.length > 0
                                    ? fields.reduce(
                                        (max, field) =>
                                          Math.max(max, field.value),
                                        0,
                                      ) + 1
                                    : 0,
                              })
                            }
                          />
                        </div>
                      )}
                    </>
                  )}
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Provide an optional description of the score config..."
                      value={field.value ?? undefined}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {formError && (
              <p role="alert">
                <span className="font-bold">Error:</span> {formError}
              </p>
            )}
          </Dialog.Body>
        </form>
      </Form>
    </Dialog>
  );
}
