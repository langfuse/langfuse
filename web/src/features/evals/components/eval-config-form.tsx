import { usePostHog } from "posthog-js/react";
import { useFieldArray, useForm } from "react-hook-form";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  tracesTableColsWithOptions,
  singleFilter,
  JobConfiguration,
} from "@langfuse/shared";
import * as z from "zod";
import { Card } from "@/src/components/ui/card";
import { useEffect, useState } from "react";
import { api } from "@/src/utils/api";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import {
  type EvalTemplate,
  variableMapping,
  wipVariableMapping,
  evalObjects,
} from "@langfuse/shared";
import router from "next/router";
import { jsonSchema } from "@/src/utils/zod";
import Decimal from "decimal.js";

const formSchema = z.object({
  evalTemplateId: z.string(),
  scoreName: z.string(),
  target: z.string(),
  filter: z.array(singleFilter).nullable(), // re-using the filter type from the tables
  mapping: z.array(wipVariableMapping),
  sampling: z.coerce.number().gte(0).lte(1),
  delay: z.coerce.number().optional().default(10_000),
});

export const EvalConfigForm = (props: {
  projectId: string;
  evalTemplates: EvalTemplate[];
  disabled?: boolean;
  existingEvalConfig?: JobConfiguration & { evalTemplate: EvalTemplate };
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    disabled: props.disabled,
    defaultValues: {
      evalTemplateId: props.existingEvalConfig?.evalTemplate.id ?? "",
      scoreName: props.existingEvalConfig?.scoreName ?? "",
      target: props.existingEvalConfig?.targetObject ?? "",
      filter: props.existingEvalConfig?.filter
        ? z.array(singleFilter).parse(props.existingEvalConfig?.filter)
        : [],
      mapping: props.existingEvalConfig?.variableMapping
        ? z
            .array(variableMapping)
            .parse(props.existingEvalConfig?.variableMapping)
        : z.array(variableMapping).parse([]),
      sampling: props.existingEvalConfig?.sampling
        ? props.existingEvalConfig?.sampling.toNumber()
        : 1,
      delay: props.existingEvalConfig?.delay
        ? props.existingEvalConfig?.delay
        : 10_000,
    },
  });

  const traceFilterOptions = api.traces.filterOptions.useQuery({
    projectId: props.projectId,
    ...form.getFieldState("filter"),
  });

  const getSelectedEvalTemplate = props.evalTemplates.find(
    (template) => template.id === form.getValues().evalTemplateId,
  );

  useEffect(() => {
    if (getSelectedEvalTemplate) {
      form.setValue("mapping", []);
      form.setValue(
        "mapping",
        getSelectedEvalTemplate.vars.map((v) => ({
          templateVariable: v,
          langfuseObject: "trace" as const,
        })),
      );
    }
  }, [form, getSelectedEvalTemplate]);

  const { fields } = useFieldArray({
    control: form.control,
    name: "mapping",
  });

  const utils = api.useUtils();
  const createJobMutation = api.evals.createJob.useMutation({
    onSuccess: () => utils.models.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log("submitting", values);
    posthog.capture("models:new_template_form");

    if (!getSelectedEvalTemplate) {
      setFormError("Please select an eval template");
      return;
    }

    // validate wip variable mapping
    const validatedVarMapping = z.array(variableMapping).parse(values.mapping);

    createJobMutation
      .mutateAsync({
        projectId: props.projectId,
        evalTemplateId: getSelectedEvalTemplate.id,
        scoreName: values.scoreName,
        target: values.target,
        filter: values.filter,
        mapping: validatedVarMapping,
        sampling: values.sampling,
      })
      .then(() => {
        props.onFormSuccess?.();
        form.reset();
        void router.push(`/project/${props.projectId}/evals/configs/`);
      })
      .catch((error) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if ("message" in error && typeof error.message === "string") {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          setFormError(error.message as string);
          return;
        } else {
          setFormError(JSON.stringify(error));
          console.error(error);
        }
      });
  }

  console.log(form.watch(), form.getValues());
  return (
    <Form {...form}>
      {JSON.stringify(form.watch(), null, 2)}
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4">
          <FormField
            control={form.control}
            name="evalTemplateId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Eval Template</FormLabel>
                <Select
                  defaultValue={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                  }}
                >
                  <FormControl>
                    <SelectTrigger
                      disabled={props.disabled}
                      defaultValue={
                        props.existingEvalConfig?.evalTemplate
                          ? props.existingEvalConfig?.evalTemplate.id
                          : undefined
                      }
                    >
                      <SelectValue placeholder="Select a model to run this eval template" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.evalTemplates.map((template) => (
                      <SelectItem value={template.id} key={template.id}>
                        {`${template.name}-${template.version}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="scoreName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Score Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>
                  Optional score name, defaults to ABCDEFG
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Card className="p-4">
            <FormField
              control={form.control}
              name="target"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Eval target object</FormLabel>
                  <FormControl>
                    <Tabs defaultValue="trace">
                      <TabsList {...field}>
                        <TabsTrigger value="trace">Trace</TabsTrigger>
                        <TabsTrigger value="observation" disabled={true}>
                          Observation (coming soon)
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </FormControl>
                  <FormDescription>Description</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>
          <Card className="p-4"></Card>
          <FormField
            control={form.control}
            name="filter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target filter</FormLabel>
                <FormControl>
                  <InlineFilterBuilder
                    columns={tracesTableColsWithOptions(
                      traceFilterOptions.data,
                    )}
                    filterState={field.value ?? []}
                    onChange={(value) => field.onChange(value)}
                    disabled={props.disabled}
                  />
                </FormControl>
                <FormDescription>
                  This will run on all future and XX historical traces.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Card className="p-4">
            <FormLabel>Variable mapping</FormLabel>
            <FormControl>Here will some variable mapping be added.</FormControl>
            <div className="mt-2 flex flex-col gap-2">
              {fields.map((mappingField, index) => (
                <div className="flex gap-2" key={index}>
                  <span className="whitespace-nowrap rounded-md bg-slate-200 px-2 py-1 text-xs	">
                    {mappingField.templateVariable}
                  </span>
                  <FormField
                    control={form.control}
                    key={`${mappingField.id}-langfuseObject`}
                    name={`mapping.${index}.langfuseObject`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Select
                            defaultValue={
                              evalObjects.find(
                                (evalObject) => evalObject.id === field.value,
                              )?.display
                            }
                            onValueChange={(value) => {
                              const obj = evalObjects.find(
                                (evalObject) => evalObject.display === value,
                              );
                              field.onChange(obj?.id);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Object type" />
                            </SelectTrigger>
                            <SelectContent>
                              {evalObjects.map((evalObject) => (
                                <SelectItem
                                  value={evalObject.display}
                                  key={evalObject.id}
                                >
                                  {evalObject.display}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch(`mapping.${index}.langfuseObject`) !== "trace" ? (
                    <FormField
                      control={form.control}
                      key={`${mappingField.id}-objectName`}
                      name={`mapping.${index}.objectName`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input {...field} value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : undefined}

                  <FormField
                    control={form.control}
                    key={`${mappingField.id}-selectedColumnId`}
                    name={`mapping.${index}.selectedColumnId`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Select
                            defaultValue={
                              field.value
                                ? evalObjects.find(
                                    (evalObject) =>
                                      evalObject.id === field.value,
                                  )?.availableColumns[0].name ?? "N/A"
                                : "N/A"
                            }
                            onValueChange={(value) => {
                              const availableColumns = evalObjects.find(
                                (evalObject) =>
                                  evalObject.id ===
                                  form.watch(`mapping.${index}.langfuseObject`),
                              )?.availableColumns;
                              const column = availableColumns?.find(
                                (column) => column.name === value,
                              );

                              field.onChange(column?.id);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Object type" />
                            </SelectTrigger>
                            <SelectContent>
                              {evalObjects
                                .find(
                                  (evalObject) =>
                                    evalObject.id ===
                                    form.watch(
                                      `mapping.${index}.langfuseObject`,
                                    ),
                                )
                                ?.availableColumns.map((column) => (
                                  <SelectItem
                                    value={column.name}
                                    key={column.id}
                                  >
                                    {column.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
            <FormDescription>Description </FormDescription>
            <FormMessage />
          </Card>
          <Card className="p-4">
            <FormField
              control={form.control}
              name="sampling"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sampling</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>Description </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="delay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delay (ms)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>Description </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>
        </div>

        {!props.disabled ? (
          <Button
            type="submit"
            loading={createJobMutation.isLoading}
            className="mt-3"
          >
            Save
          </Button>
        ) : null}
      </form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </Form>
  );
};
