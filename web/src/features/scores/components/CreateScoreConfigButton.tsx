import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { PlusIcon, Trash } from "lucide-react";
import { type UseFormReturn, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { isPresent, ScoreDataType, availableDataTypes } from "@langfuse/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api } from "@/src/utils/api";
import { Textarea } from "@/src/components/ui/textarea";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";
import DocPopup from "@/src/components/layouts/doc-popup";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { z } from "zod/v4";

const Category = z.object({
  label: z.string().min(1),
  value: z.number(),
});

const createConfigSchema = z.object({
  name: z.string().min(1).max(35),
  dataType: z.enum(availableDataTypes),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  categories: z.array(Category).optional(),
  description: z.string().optional(),
});

type CreateConfig = z.infer<typeof createConfigSchema>;

const validateScoreConfig = (values: CreateConfig): string | null => {
  const { dataType, maxValue, minValue, categories } = values;

  if (isNumericDataType(dataType)) {
    if (
      isPresent(maxValue) &&
      isPresent(minValue) &&
      Number(maxValue) <= Number(minValue)
    ) {
      return "Maximum value must be greater than Minimum value.";
    }
  } else if (isCategoricalDataType(dataType)) {
    if (!categories || categories.length === 0) {
      return "At least one category is required for categorical data types.";
    }
  } else if (isBooleanDataType(dataType)) {
    if (categories?.length !== 2)
      return "Boolean data type must have exactly 2 categories.";
    const isBooleanCategoryInvalid = categories?.some(
      (category) => category.value !== 0 && category.value !== 1,
    );
    if (isBooleanCategoryInvalid)
      return "Boolean data type must have categories with values 0 and 1.";
  }

  const uniqueNames = new Set<string>();
  const uniqueValues = new Set<number>();

  for (const category of categories || []) {
    if (uniqueNames.has(category.label)) {
      return "Category names must be unique.";
    }
    uniqueNames.add(category.label);

    if (uniqueValues.has(category.value)) {
      return "Category values must be unique.";
    }
    uniqueValues.add(category.value);
  }

  return null;
};

export function CreateScoreConfigButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const capture = usePostHogClientCapture();

  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "scoreConfigs:CUD",
  });

  const utils = api.useUtils();
  const createScoreConfig = api.scoreConfigs.create.useMutation({
    onSuccess: () => utils.scoreConfigs.invalidate(),
    onError: (error) =>
      setFormError(error.message ?? "An error occurred while creating config."),
  });

  const form = useForm({
    resolver: zodResolver(createConfigSchema),
    defaultValues: {
      dataType: ScoreDataType.NUMERIC,
      minValue: undefined,
      maxValue: undefined,
      name: "",
    },
  }) as UseFormReturn<CreateConfig>;

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "categories",
  });

  if (!hasAccess) return null;

  async function onSubmit(values: CreateConfig) {
    const error = validateScoreConfig(values);
    setFormError(error);
    const isValid = await form.trigger();
    if (!isValid || error) return;

    return createScoreConfig
      .mutateAsync({
        projectId,
        ...values,
        categories: values.categories?.length ? values.categories : undefined,
      })
      .then(() => {
        capture("score_configs:create_form_submit", {
          dataType: values.dataType,
        });
        form.reset();
        setOpen(false);
        setConfirmOpen(false);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  const handleSubmitConfirm = async () => {
    const error = validateScoreConfig(form.getValues());
    setFormError(error);
    const isValid = await form.trigger();
    if (isValid && !error) {
      setConfirmOpen(true);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          form.reset();
          setFormError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="secondary" loading={createScoreConfig.isLoading}>
            <PlusIcon className="-ml-0.5 mr-1.5 h-4 w-4" aria-hidden="true" />
            Add new score config
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add new score config</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              className="space-y-6"
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <DialogBody>
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
                          onBlur={(e) =>
                            field.onChange(e.target.value.trimEnd())
                          }
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
                      <Select
                        defaultValue={field.value}
                        onValueChange={(value) => {
                          field.onChange(
                            value as (typeof availableDataTypes)[number],
                          );
                          form.clearErrors();
                          if (isNumericDataType(value as ScoreDataType)) {
                            form.setValue("categories", undefined);
                          } else {
                            form.setValue("minValue", undefined);
                            form.setValue("maxValue", undefined);
                            if (isBooleanDataType(value as ScoreDataType)) {
                              replace([
                                { label: "True", value: 1 },
                                { label: "False", value: 0 },
                              ]);
                            } else {
                              replace([{ label: "", value: 0 }]);
                            }
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a data type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableDataTypes.map((role) => (
                            <SelectItem value={role} key={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {isNumericDataType(form.getValues("dataType")) ? (
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
                              // manually manage controlled input state
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
                              // manually manage controlled input state
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
                ) : (
                  <div className="grid grid-flow-row gap-2">
                    <FormField
                      control={form.control}
                      name="categories"
                      render={() => (
                        <>
                          {fields.length > 0 && (
                            <div className="mb-2 grid grid-cols-[1fr,3fr] items-center gap-2 text-left sm:grid-cols-[1fr,7fr]">
                              <FormLabel className="grid grid-flow-col">
                                Value
                                <DocPopup
                                  description={`This is how the ${
                                    isCategoricalDataType(
                                      form.getValues("dataType"),
                                    )
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
                              className="items-top mb-2 grid grid-cols-[1fr,3fr] gap-2 text-left sm:grid-cols-[1fr,7fr]"
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
                                        className="text-center"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <div className="grid grid-cols-[1fr,auto] gap-2">
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
                                            field.onChange(
                                              e.target.value.trimEnd(),
                                            )
                                          }
                                          readOnly={isBooleanDataType(
                                            form.getValues("dataType"),
                                          )}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                {isCategoricalDataType(
                                  form.getValues("dataType"),
                                ) && (
                                  <Button
                                    onClick={() => remove(index)}
                                    variant="outline"
                                    size="icon"
                                    disabled={
                                      index === 0 || index !== fields.length - 1
                                    }
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                          {isCategoricalDataType(
                            form.getValues("dataType"),
                          ) && (
                            <div className="grid-cols-auto grid">
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={
                                  isBooleanDataType(
                                    form.getValues("dataType"),
                                  ) && fields.length === 2
                                }
                                onClick={() =>
                                  append({ label: "", value: fields.length })
                                }
                              >
                                Add category
                              </Button>
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
                    <>
                      <FormItem>
                        <FormLabel>Description (optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Provide an optional description of the score config..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    </>
                  )}
                />
              </DialogBody>
            </form>
            <Dialog
              open={confirmOpen}
              onOpenChange={(isOpenAction) => {
                if (!isOpenAction && !form.formState.isSubmitting)
                  setConfirmOpen(false);
              }}
            >
              <DialogTrigger asChild>
                <div className="p-6 pt-0">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleSubmitConfirm}
                  >
                    Submit
                  </Button>
                </div>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Submission</DialogTitle>
                </DialogHeader>
                <DialogBody>
                  <p className="py-4 text-sm">
                    Score configs cannot be edited or deleted after they have
                    been created. Are you sure you want to proceed?
                  </p>
                </DialogBody>
                <DialogFooter>
                  <div className="flex w-full flex-col gap-4">
                    <div className="flex justify-end space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={form.formState.isSubmitting}
                        onClick={() => setConfirmOpen(false)}
                      >
                        Continue Editing
                      </Button>
                      <Button
                        type="submit"
                        loading={form.formState.isSubmitting}
                        onClick={form.handleSubmit(onSubmit)}
                      >
                        Confirm
                      </Button>
                    </div>
                    {formError ? (
                      <p className="text-red w-full text-center">
                        <span className="font-bold">Error:</span> {formError}
                      </p>
                    ) : null}
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
