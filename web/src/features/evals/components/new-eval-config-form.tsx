import { usePostHog } from "posthog-js/react";
import { useForm } from "react-hook-form";
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
import { TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Tabs } from "@radix-ui/react-tabs";
import { tracesTableColsWithOptions } from "@langfuse/shared";
import { type FilterState } from "@langfuse/shared";
import * as z from "zod";
import { singleFilter } from "@langfuse/shared";
import { Card } from "@/src/components/ui/card";
import { useState } from "react";
import { api } from "@/src/utils/api";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type EvalTemplate } from "@prisma/client";
import router from "next/router";

const formSchema = z.object({
  evalTemplateId: z.string(),
  scoreName: z.string(),
  target: z.string(),
  filter: z.array(singleFilter).nullable(), // re-using the filter type from the tables
  mapping: z.array(z.object({ name: z.string(), value: z.string() })),
  sampling: z.string().transform(Number).pipe(z.number().gte(0).lte(1)),
});

export const NewEvalConfigForm = (props: {
  projectId: string;
  evalTemplates: EvalTemplate[];
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      evalTemplateId: "",
      scoreName: undefined,
      target: "trace",
      filter: [] as FilterState,
      mapping: [],
      sampling: 1,
    },
  });

  const traceFilterOptions = api.traces.filterOptions.useQuery({
    projectId: props.projectId,
    ...form.getFieldState("filter"),
  });

  const selectedEvalTemplate = props.evalTemplates.find(
    (template) =>
      `${template.name}-${template.version}` ===
      form.getValues().evalTemplateId,
  );
  const updateVariableValue = (variable: string, value: string) => {
    const currentMapping = form.getValues().mapping;
    if (Array.isArray(currentMapping)) {
      let updatedMapping = [...currentMapping];

      const variableIndex = updatedMapping.findIndex(
        (mapping) => mapping.name === variable,
      );

      if (variableIndex !== -1) {
        updatedMapping[variableIndex] = { name: variable, value };
      } else {
        updatedMapping.push({ name: variable, value });
      }
      form.setValue("mapping", updatedMapping);
    } else {
      form.setValue("mapping", [{ name: variable, value }]);
    }
  };

  const utils = api.useUtils();
  const createJobMutation = api.evals.createJob.useMutation({
    onSuccess: () => utils.models.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    posthog.capture("models:new_template_form");
    if (!selectedEvalTemplate) {
      setFormError("Please select an eval template");
      return;
    }
    createJobMutation
      .mutateAsync({
        projectId: props.projectId,
        evalTemplateId: selectedEvalTemplate.id,
        scoreName: values.scoreName,
        target: values.target,
        filter: values.filter,
        mapping: values.mapping,
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

  return (
    <Form {...form}>
      {JSON.stringify(form.getValues(), null, 2)}
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
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model to run this eval template" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.evalTemplates.map((template) => (
                      <SelectItem
                        value={`${template.name}-${template.version}`}
                        key={template.id}
                      >
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
          <Card className="p-4">
            <FormField
              control={form.control}
              name="filter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target filter</FormLabel>
                  <FormControl>
                    <div className="w-1/2">
                      <InlineFilterBuilder
                        columns={tracesTableColsWithOptions(
                          traceFilterOptions.data,
                        )}
                        filterState={field.value ?? []}
                        onChange={(value) => field.onChange(value)}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    This will run on all future and XX historical traces.
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
                <FormItem>
                  <FormLabel>Variable mapping</FormLabel>
                  <FormControl>
                    Here will some variable mapping be added.
                  </FormControl>
                  {selectedEvalTemplate?.vars.map((variable) => (
                    <div key={variable}>
                      <div className="flex">
                        <span className="mr-2 rounded-sm bg-gray-200 p-1 text-xs">
                          {variable}
                        </span>
                        <Input
                          onInput={(event) => {
                            updateVariableValue(
                              variable,
                              event.currentTarget.value,
                            );
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <FormDescription>Description </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>
          <Card className="p-4">
            <FormField
              control={form.control}
              name="sampling"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sampling</FormLabel>
                  <FormControl>
                    Here will some variable mapping be added.
                  </FormControl>

                  <Input {...field} />
                  <FormDescription>Description </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>
        </div>

        <Button
          type="submit"
          loading={createJobMutation.isLoading}
          className="mt-3"
        >
          Save
        </Button>
      </form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </Form>
  );
};
