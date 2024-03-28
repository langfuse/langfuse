import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import JsonView from "react18-json-view";
import * as z from "zod";
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
import { extractVariables } from "@/src/utils/string";
import { evalModelList, evalModels } from "@/src/features/evals/constants";
import { Badge } from "@/src/components/ui/badge";
import { jsonSchema } from "@/src/utils/zod";
import router from "next/router";
import { AutoComplete } from "@/src/features/prompts/components/auto-complete";
import { type EvalTemplate } from "@prisma/client";

const formSchema = z.object({
  name: z.string(),
  prompt: z
    .string()
    .min(1, "Enter a prompt")
    .refine((val) => {
      const variables = extractVariables(val);
      const matches = variables.map((variable) => {
        // check regex here
        if (variable.match(/^[A-Za-z_]+$/)) {
          return true;
        }
        return false;
      });
      return !matches.includes(false);
    }, "Variables must only contain letters and underscores (_)"),

  variables: z.array(
    z.string().min(1, "Variables must have at least one character"),
  ),
  model: evalModels,
  modelParameters: z.string().refine(
    (value) => {
      try {
        JSON.parse(value);
        return true;
      } catch (e) {
        return false;
      }
    },
    {
      message: "Config needs to be valid JSON",
    },
  ),
  outputScore: z.string(),
  outputName: z.string(),
  outputReasoning: z.string(),
});

export const NewEvalTemplateForm = (props: {
  projectId: string;
  existingEvalTemplates: EvalTemplate[];
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      model: "gpt-4" as const,
      prompt: "",
      variables: [],
      modelParameters: "{}",
      outputName: "",
      outputScore: "",
      outputReasoning: "",
    },
  });

  const extractedVariables = extractVariables(form.watch("prompt"));

  const utils = api.useUtils();
  const createEvalTemplateMutation = api.evals.createTemplate.useMutation({
    onSuccess: () => utils.models.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    posthog.capture("models:new_template_form");
    createEvalTemplateMutation
      .mutateAsync({
        name: values.name,
        projectId: props.projectId,
        prompt: values.prompt,
        model: values.model,
        modelParameters:
          values.modelParameters &&
          typeof JSON.parse(values.modelParameters) === "object"
            ? jsonSchema.parse(JSON.parse(values.modelParameters))
            : jsonSchema.parse({}),
        variables: extractedVariables,
        outputSchema: {
          score: values.outputScore,
          reasoning: values.outputReasoning,
        },
      })
      .then(() => {
        props.onFormSuccess?.();
        form.reset();
        void router.push(`/project/${props.projectId}/evals/templates/`);
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
        <div className="grid grid-cols-4 gap-x-12">
          <div className="col-span-3 row-span-1">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <>
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <AutoComplete
                        {...field}
                        options={props.existingEvalTemplates.map(
                          (template) => ({
                            value: template.name,
                            label: template.name,
                          }),
                        )}
                        placeholder=""
                        onValueChange={(option) => field.onChange(option.value)}
                        value={{ value: field.value, label: field.value }}
                        disabled={false}
                        createLabel="New eval template name:"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </>
              )}
            />
          </div>

          <div className="col-span-3 row-span-4">
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <>
                  <FormItem>
                    <FormLabel>Prompt</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="min-h-[150px] flex-1 font-mono text-xs"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                  <FormDescription>
                    <p className="text-sm text-gray-500">
                      You can use{" "}
                      <code className="text-xs">{"{{variable}}"}</code> to
                      insert variables into your prompt. The following variables
                      are available:
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {extractedVariables.map((variable) => (
                        <Badge key={variable} variant="outline">
                          {variable}
                        </Badge>
                      ))}
                    </div>
                  </FormDescription>
                </>
              )}
            />

            <FormField
              control={form.control}
              name="outputScore"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Score</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>Description</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="outputReasoning"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reasoning</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>Description</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="col-span-1">
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={(value) =>
                      field.onChange(value as (typeof evalModelList)[number])
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model to run this eval template" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {evalModelList.map((model) => (
                        <SelectItem value={model} key={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="col-span-1 row-span-2">
            <FormField
              control={form.control}
              name="modelParameters"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model Parameters</FormLabel>
                  <JsonView
                    src={jsonSchema.parse(JSON.parse(field.value))}
                    onEdit={(edit) => {
                      // need to put string back into the state
                      field.onChange(JSON.stringify(edit.src));
                    }}
                    editable
                    className="rounded-md border border-gray-200 p-2 text-sm"
                  />
                  <FormDescription>
                    Set parameters to use for the LLM call.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
