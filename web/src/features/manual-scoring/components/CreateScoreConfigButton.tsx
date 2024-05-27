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

const isNumeric = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.NUMERIC;
const isCategorical = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.CATEGORICAL;

const availableDataTypes = [
  ScoreDataType.NUMERIC,
  ScoreDataType.CATEGORICAL,
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
});

export function CreateScoreConfigButton({ projectId }: { projectId: string }) {
  // const capture = usePostHogClientCapture();
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
    },
  });

  const { fields, append, remove } = useFieldArray({
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
    <div className="grid justify-items-end">
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
                      <Input {...field} />
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
                        if (isCategorical(value as ScoreDataType)) {
                          append({ label: "", value: 0 });
                          form.setValue("minValue", undefined);
                          form.setValue("maxValue", undefined);
                        } else remove();
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
              {isNumeric(form.watch("dataType")) && (
                <>
                  <FormField
                    control={form.control}
                    name="minValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum</FormLabel>
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
                        <FormLabel>Maximum</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              {isCategorical(form.watch("dataType")) && (
                <div className="grid grid-flow-row gap-2">
                  <FormField
                    control={form.control}
                    name="categories"
                    render={() => (
                      <>
                        <FormControl>
                          Here will some variable mapping be added.
                        </FormControl>
                        {fields.length > 0 && (
                          <div className="mb-2 grid grid-cols-9 items-center gap-2 text-left">
                            <FormLabel className="col-span-4">Label</FormLabel>
                            <FormLabel className="col-span-4">Value</FormLabel>
                          </div>
                        )}
                        {fields.map((category, index) => (
                          <div
                            key={`${category.id}-langfuseObject`}
                            className="items-top mb-2 grid grid-cols-9 gap-2 text-left"
                          >
                            <div className="col-span-4">
                              <FormField
                                control={form.control}
                                name={`categories.${index}.label`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="col-span-4">
                              <FormField
                                control={form.control}
                                name={`categories.${index}.value`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input {...field} type="number" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <Button
                              onClick={() => remove(index)}
                              variant="outline"
                              size="icon"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="grid-cols-auto grid">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => append({ label: "", value: 0 })}
                          >
                            Add category
                          </Button>
                        </div>
                      </>
                    )}
                  />
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                loading={form.formState.isSubmitting}
              >
                Submit
              </Button>
              <FormMessage />
            </form>
            {formError ? (
              <p className="text-red text-center">
                <span className="font-bold">Error:</span> {formError}
              </p>
            ) : null}
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function validateForm(values: z.infer<typeof formSchema>): string | null {
  if (isNumeric(values.dataType)) {
    if (!values.minValue || !values.maxValue) {
      return "Both Minimum and Maximum values are required for numeric data types.";
    }
    if (values.maxValue < values.minValue) {
      return "Maximum value must be greater than Minimum value.";
    }
  } else if (isCategorical(values.dataType)) {
    if (!values.categories || values.categories.length === 0) {
      return "At least one category is required for categorical data types.";
    }
  }
  return null;
}
