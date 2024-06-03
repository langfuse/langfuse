import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { PlusIcon, Trash2 } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
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
import { ScoreDataType } from "@langfuse/shared";
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
  isCategorical,
  isNumeric,
} from "@/src/features/manual-scoring/lib/helpers";
import DocPopup from "@/src/components/layouts/doc-popup";

const availableDataTypes = [
  ScoreDataType.NUMERIC,
  ScoreDataType.CATEGORICAL,
  ScoreDataType.BOOLEAN,
] as const;

const category = z.object({
  label: z.string().min(1),
  value: z.coerce.number(),
});

const formSchema = z.object({
  name: z.string().min(1),
  dataType: z.enum(availableDataTypes),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  categories: z.array(category).optional(),
  description: z.string().min(1).optional(),
});

export function CreateScoreConfigButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hasAccess = useHasAccess({
    projectId: projectId,
    scope: "scoreConfigs:CUD",
  });

  const utils = api.useUtils();
  const createScoreConfig = api.scoreConfigs.create.useMutation({
    onSuccess: () => utils.scoreConfigs.invalidate(),
    onError: (error) =>
      setFormError(error.message ?? "An error occurred while creating config."),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dataType: ScoreDataType.NUMERIC,
      minValue: undefined,
      maxValue: undefined,
      name: "",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "categories",
  });

  if (!hasAccess) return null;

  function onSubmit(values: z.infer<typeof formSchema>) {
    const error = validateForm(values);
    setFormError(error);
    if (error) return;

    return createScoreConfig
      .mutateAsync({
        projectId,
        ...values,
      })
      .then(() => {
        form.reset();
        setOpen(false);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" loading={createScoreConfig.isLoading}>
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Add new score config
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new score config</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              className="space-y-6"
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit)}
            >
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
                    <Select
                      defaultValue={field.value}
                      onValueChange={(value) => {
                        field.onChange(
                          value as (typeof availableDataTypes)[number],
                        );
                        if (isNumeric(value as ScoreDataType)) {
                          remove();
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
              {isNumeric(form.getValues("dataType")) ? (
                <>
                  <FormField
                    control={form.control}
                    name="minValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" />
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
                          <Input {...field} type="number" />
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
                                  isCategorical(form.getValues("dataType"))
                                    ? "category"
                                    : "boolean"
                                } label is mapped to an integer value internally.`}
                                size="xs"
                              ></DocPopup>
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
                              {isCategorical(form.getValues("dataType")) && (
                                <Button
                                  onClick={() => remove(index)}
                                  variant="outline"
                                  size="icon"
                                  disabled={
                                    index === 0 || index !== fields.length - 1
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        {isCategorical(form.getValues("dataType")) && (
                          <div className="grid-cols-auto grid">
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={
                                isBooleanDataType(form.getValues("dataType")) &&
                                fields.length === 2
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
              <Button
                type="submit"
                className="w-full"
                loading={form.formState.isSubmitting}
              >
                Submit
              </Button>
            </form>
            {formError ? (
              <p className="text-red text-center">
                <span className="font-bold">Error:</span> {formError}
              </p>
            ) : null}
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function validateForm(values: z.infer<typeof formSchema>): string | null {
  if (isNumeric(values.dataType)) {
    if (
      !!values.maxValue &&
      !!values.minValue &&
      values.maxValue <= values.minValue
    ) {
      return "Maximum value must be greater than Minimum value.";
    }
  } else if (isCategorical(values.dataType)) {
    if (!values.categories || values.categories.length === 0) {
      return "At least one category is required for categorical data types.";
    }
  } else if (isBooleanDataType(values.dataType)) {
    if (values.categories?.length !== 2)
      return "Boolean data type must have exactly 2 categories.";
    const isBooleanCategoryInvalid = values.categories?.some(
      (category) => category.value !== 0 && category.value !== 1,
    );
    if (isBooleanCategoryInvalid)
      return "Boolean data type must have categories with values 0 and 1.";
  }

  const uniqueNames = new Set<string>();
  const uniqueValues = new Set<number>();

  for (const category of values.categories || []) {
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
}
