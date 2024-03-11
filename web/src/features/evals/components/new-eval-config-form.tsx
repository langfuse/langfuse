import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import JsonView from "react18-json-view";
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
import { Textarea } from "@/src/components/ui/textarea";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/src/components/ui/badge";
import { jsonSchema } from "@/src/utils/zod";
import router from "next/router";
import { type EvalTemplate } from "@prisma/client";
import { TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Tabs } from "@radix-ui/react-tabs";
import { FilterBuilder } from "@/src/features/filters/components/filter-builder";
import { tracesTableCols } from "@/src/server/api/definitions/tracesTable";
import { type FilterState } from "@/src/features/filters/types";
import * as z from "zod";
import { singleFilter } from "@/src/server/api/interfaces/filters";

const formSchema = z.object({
  evalTemplateId: z.string(),
  scoreName: z.string().nullable(),
  target: z.string(),
  filter: z.array(singleFilter).nullable(), // re-using the filter type from the tables
  mapping: z.string(),
  sampling: z.number(),
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
      mapping: "{}",
      sampling: 1,
    },
  });

  const utils = api.useUtils();
  const createEvalTemplateMutation = api.evals.createTemplate.useMutation({
    onSuccess: () => utils.models.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    posthog.capture("models:new_template_form");
    // createEvalTemplateMutation
    //   .mutateAsync({
    //     projectId: props.projectId,
    //     prompt: values.prompt,
    //     model: values.model,
    //     modelParameters:
    //       values.modelParameters &&
    //       typeof JSON.parse(values.modelParameters) === "object"
    //         ? jsonSchema.parse(JSON.parse(values.modelParameters))
    //         : jsonSchema.parse({}),
    //     variables: values.variables,
    //     outputSchema: {
    //       score: values.score,
    //       name: values.name,
    //       reasoning: values.reasoning,
    //     },
    //   })
    //   .then(() => {
    //     props.onFormSuccess?.();
    //     form.reset();
    //     void router.push(`/project/${props.projectId}/evals/templates/`);
    //   })
    //   .catch((error) => {
    //     // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    //     if ("message" in error && typeof error.message === "string") {
    //       // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    //       setFormError(error.message as string);
    //       return;
    //     } else {
    //       setFormError(JSON.stringify(error));
    //       console.error(error);
    //     }
    //   });
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
            name="evalTemplateId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <Select
                  defaultValue={field.value}
                  onValueChange={(value) => {}}
                  // field.onChange(value as (typeof evalModelList)[number])
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

          <FormField
            control={form.control}
            name="target"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Eval target object</FormLabel>
                <FormControl>
                  <Tabs>
                    <TabsList {...field}>
                      <TabsTrigger value="account">Trace</TabsTrigger>
                      <TabsTrigger value="password" disabled={true}>
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
          <FormField
            control={form.control}
            name="filter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target filter</FormLabel>
                <FormControl>
                  <FilterBuilder
                    columns={tracesTableCols}
                    filterState={field.value}
                    onChange={(value) => field.onChange(value)}
                  />
                </FormControl>
                <FormDescription>
                  This will run on all future and XX historical traces.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mapping"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Variable mapping</FormLabel>
                <FormControl>
                  Here will some variable mapping be added.
                </FormControl>
                <FormDescription>Description </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sampling"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Variable mapping</FormLabel>
                <FormControl>
                  Here will some variable mapping be added.
                </FormControl>
                <FormDescription>Description </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          loading={createEvalTemplateMutation.isLoading}
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
