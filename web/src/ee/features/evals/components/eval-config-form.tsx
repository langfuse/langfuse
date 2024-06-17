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
  evalTableCols,
  singleFilter,
  type JobConfiguration,
  availableEvalVariables,
} from "@langfuse/shared";
import * as z from "zod";
import { useEffect, useState } from "react";
import { api } from "@/src/utils/api";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import {
  type EvalTemplate,
  variableMapping,
  wipVariableMapping,
} from "@langfuse/shared";
import router from "next/router";
import { Slider } from "@/src/components/ui/slider";
import { Card } from "@/src/components/ui/card";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Label } from "@/src/components/ui/label";
import DocPopup from "@/src/components/layouts/doc-popup";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const formSchema = z.object({
  scoreName: z.string(),
  target: z.string(),
  filter: z.array(singleFilter).nullable(), // re-using the filter type from the tables
  mapping: z.array(wipVariableMapping),
  sampling: z.coerce.number().gte(0).lte(1),
  delay: z.coerce.number().optional().default(10),
});

export const EvalConfigForm = (props: {
  projectId: string;
  evalTemplates: EvalTemplate[];
  disabled?: boolean;
  existingEvalConfig?: JobConfiguration & { evalTemplate: EvalTemplate };
  onFormSuccess?: () => void;
}) => {
  const [evalTemplate, setEvalTemplate] = useState<string | undefined>(
    props.existingEvalConfig?.evalTemplate.id,
  );

  const currentTemplate = props.evalTemplates.find(
    (t) => t.id === evalTemplate,
  );

  return (
    <>
      {!props.disabled ? (
        <Select onValueChange={setEvalTemplate} value={evalTemplate}>
          <SelectTrigger
            disabled={props.disabled}
            defaultValue={
              props.existingEvalConfig?.evalTemplate
                ? props.existingEvalConfig?.evalTemplate.id
                : undefined
            }
          >
            <SelectValue placeholder="Select a template to run this eval config" />
          </SelectTrigger>
          <SelectContent>
            {props.evalTemplates.map((template) => (
              <SelectItem value={template.id} key={template.id}>
                {`${template.name}-v${template.version}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : undefined}
      {evalTemplate && currentTemplate ? (
        <InnerEvalConfigForm
          projectId={props.projectId}
          disabled={props.disabled}
          existingEvalConfig={props.existingEvalConfig}
          evalTemplate={
            props.existingEvalConfig?.evalTemplate ?? currentTemplate
          }
          onFormSuccess={props.onFormSuccess}
        />
      ) : null}
    </>
  );
};

export const InnerEvalConfigForm = (props: {
  projectId: string;
  evalTemplate: EvalTemplate;
  disabled?: boolean;
  existingEvalConfig?: JobConfiguration;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    disabled: props.disabled,
    defaultValues: {
      scoreName:
        props.existingEvalConfig?.scoreName ??
        `${props.evalTemplate.name}-v${props.evalTemplate.version}`,
      target: props.existingEvalConfig?.targetObject ?? "",
      filter: props.existingEvalConfig?.filter
        ? z.array(singleFilter).parse(props.existingEvalConfig.filter)
        : [],
      mapping: props.existingEvalConfig?.variableMapping
        ? z
            .array(variableMapping)
            .parse(props.existingEvalConfig.variableMapping)
        : z.array(variableMapping).parse(
            props.evalTemplate
              ? props.evalTemplate.vars.map((v) => ({
                  templateVariable: v,
                  langfuseObject: "trace" as const,
                  selectedColumnId: "input",
                }))
              : [],
          ),
      sampling: props.existingEvalConfig?.sampling
        ? props.existingEvalConfig.sampling.toNumber()
        : 1,
      delay: props.existingEvalConfig?.delay
        ? props.existingEvalConfig.delay / 1000
        : 10,
    },
  });

  const traceFilterOptions = api.traces.filterOptions.useQuery({
    projectId: props.projectId,
  });

  useEffect(() => {
    if (props.evalTemplate) {
      form.setValue(
        "mapping",
        props.evalTemplate.vars.map((v) => ({
          templateVariable: v,
          langfuseObject: "trace" as const,
          selectedColumnId: "input",
        })),
      );
      form.setValue(
        "scoreName",
        `${props.evalTemplate.name}-v${props.evalTemplate.version}`,
      );
    }
  }, [form, props.evalTemplate]);

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
    capture("eval_config:new_form_submit");

    const validatedFilter = z.array(singleFilter).safeParse(values.filter);

    if (validatedFilter.success === false) {
      form.setError("filter", {
        type: "manual",
        message: "Please fill out all filter fields",
      });
      return;
    }

    const validatedVarMapping = z
      .array(variableMapping)
      .safeParse(values.mapping);

    if (validatedVarMapping.success === false) {
      console.log(validatedVarMapping.error);
      form.setError("mapping", {
        type: "manual",
        message: "Please fill out all variable mappings",
      });
      return;
    }

    createJobMutation
      .mutateAsync({
        projectId: props.projectId,
        evalTemplateId: props.evalTemplate.id,
        scoreName: values.scoreName,
        target: values.target,
        filter: validatedFilter.data,
        mapping: validatedVarMapping.data,
        sampling: values.sampling,
        delay: values.delay * 1000, // multiply by 1k to convert to ms
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

  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4">
          <FormField
            control={form.control}
            name="scoreName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Score Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Card className="flex flex-col gap-6 p-4">
            <FormField
              control={form.control}
              name="target"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target object</FormLabel>
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
                  <FormMessage />
                </FormItem>
              )}
            />

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
                        evalTableCols,
                      )}
                      filterState={field.value ?? []}
                      onChange={(value) => field.onChange(value)}
                      disabled={props.disabled}
                    />
                  </FormControl>
                  <FormDescription>
                    This will run on all future traces that match these filters
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>
          <Card className="p-4">
            <FormField
              control={form.control}
              name="mapping"
              render={() => (
                <>
                  <FormLabel className="">Variable mapping</FormLabel>
                  <FormControl>
                    Here will some variable mapping be added.
                  </FormControl>
                  <div className="my-2 flex flex-col gap-2 lg:flex-row">
                    <JSONView
                      title={"Eval Template"}
                      json={props.evalTemplate.prompt ?? null}
                      className={"min-h-48 bg-muted lg:w-1/2"}
                    />
                    <div className=" flex flex-col gap-2 lg:w-1/3">
                      {fields.map((mappingField, index) => (
                        <Card className="flex flex-col gap-2 p-4" key={index}>
                          <div className="text-sm font-semibold	">
                            {"{{"}
                            {mappingField.templateVariable}
                            {"}}"}
                            <DocPopup
                              description={
                                "Variable in the template to be replaced with the trace data."
                              }
                              href={
                                "https://langfuse.com/docs/scores/model-based-evals"
                              }
                              size="xs"
                            />
                          </div>
                          <FormField
                            control={form.control}
                            key={`${mappingField.id}-langfuseObject`}
                            name={`mapping.${index}.langfuseObject`}
                            render={({ field }) => (
                              <div className="flex  items-center gap-2">
                                <VariableMappingDescription
                                  title={"Trace object"}
                                  description={
                                    "Langfuse object to retrieve the data from."
                                  }
                                  href={
                                    "https://langfuse.com/docs/scores/model-based-evals"
                                  }
                                />
                                <FormItem className="w-2/3">
                                  <FormControl>
                                    <Select
                                      disabled={props.disabled}
                                      defaultValue={field.value}
                                      onValueChange={field.onChange}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableEvalVariables.map(
                                          (evalObject) => (
                                            <SelectItem
                                              value={evalObject.id}
                                              key={evalObject.id}
                                            >
                                              {evalObject.display}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              </div>
                            )}
                          />

                          {form.watch(`mapping.${index}.langfuseObject`) !==
                          "trace" ? (
                            <FormField
                              control={form.control}
                              key={`${mappingField.id}-objectName`}
                              name={`mapping.${index}.objectName`}
                              render={({ field }) => (
                                <div className="flex items-center gap-2">
                                  <VariableMappingDescription
                                    title={"Object Name"}
                                    description={
                                      "Name of the Langfuse object to retrieve the data from."
                                    }
                                    href={
                                      "https://langfuse.com/docs/scores/model-based-evals"
                                    }
                                  />
                                  <FormItem className="w-2/3">
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ""}
                                        disabled={props.disabled}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                </div>
                              )}
                            />
                          ) : undefined}

                          <FormField
                            control={form.control}
                            key={`${mappingField.id}-selectedColumnId`}
                            name={`mapping.${index}.selectedColumnId`}
                            render={({ field }) => (
                              <div className="flex items-center gap-2">
                                <VariableMappingDescription
                                  title={"Object Variable"}
                                  description={
                                    "Variable on the Langfuse object to insert into the template."
                                  }
                                  href={
                                    "https://langfuse.com/docs/scores/model-based-evals"
                                  }
                                />
                                <FormItem className="w-2/3">
                                  <FormControl>
                                    <Select
                                      disabled={props.disabled}
                                      defaultValue={field.value ?? undefined}
                                      onValueChange={(value) => {
                                        const availableColumns =
                                          availableEvalVariables.find(
                                            (evalObject) =>
                                              evalObject.id ===
                                              form.watch(
                                                `mapping.${index}.langfuseObject`,
                                              ),
                                          )?.availableColumns;
                                        const column = availableColumns?.find(
                                          (column) => column.id === value,
                                        );

                                        field.onChange(column?.id);
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Object type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableEvalVariables
                                          .find(
                                            (evalObject) =>
                                              evalObject.id ===
                                              form.watch(
                                                `mapping.${index}.langfuseObject`,
                                              ),
                                          )
                                          ?.availableColumns.map((column) => (
                                            <SelectItem
                                              value={column.id}
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
                              </div>
                            )}
                          />
                        </Card>
                      ))}
                    </div>
                  </div>
                  <FormDescription>
                    Insert trace data into the prompt template.
                  </FormDescription>
                  <FormMessage />
                </>
              )}
            />
          </Card>
          <Card className="flex flex-col gap-6 p-4">
            <FormField
              control={form.control}
              name="sampling"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sampling</FormLabel>
                  <FormControl>
                    <Slider
                      disabled={props.disabled}
                      min={0}
                      max={1}
                      step={0.01}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                    />
                  </FormControl>
                  <div className="flex flex-col">
                    <FormDescription className="flex justify-between">
                      <span>0%</span>
                      <span>100%</span>
                    </FormDescription>
                    <FormDescription>
                      Percentage of traces to evaluate.
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="delay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delay (seconds)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    Time between first Trace event and evaluation execution to
                    ensure all Trace data is available
                  </FormDescription>
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
function VariableMappingDescription(p: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="flex w-1/2 items-center">
      <Label className="muted-foreground text-sm font-light">{p.title}</Label>
      <DocPopup description={p.description} href={p.href} size="xs" />
    </div>
  );
}
