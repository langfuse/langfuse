import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/src/components/ui/textarea";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { extractVariables } from "@/src/utils/string";
import router from "next/router";
import { type EvalTemplate } from "@prisma/client";
import { usePlaygroundContext } from "@/src/features/playground/client/context";
import { ModelParameters } from "@/src/features/playground/client/components/ModelParameters";
import { EvalModelNames, OutputSchema, evalModels } from "@langfuse/shared";
import { PromptDescription } from "@/src/features/prompts/components/prompt-description";

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
  model: EvalModelNames,
  outputScore: z.string(),
  outputName: z.string(),
  outputReasoning: z.string(),
});

export const EvalTemplateForm = (props: {
  projectId: string;
  existingEvalTemplate?: EvalTemplate;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const playgroundContext = usePlaygroundContext();

  const posthog = usePostHog();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    disabled: props.existingEvalTemplate !== undefined,
    defaultValues: {
      name: props.existingEvalTemplate?.name ?? "",
      model: EvalModelNames.parse(
        props.existingEvalTemplate?.model ?? "gpt-3.5-turbo",
      ),
      prompt: props.existingEvalTemplate?.prompt ?? "",
      variables: props.existingEvalTemplate?.vars ?? [],
      outputReasoning: props.existingEvalTemplate
        ? OutputSchema.parse(props.existingEvalTemplate?.outputSchema).reasoning
        : "",
      outputScore: props.existingEvalTemplate
        ? OutputSchema.parse(props.existingEvalTemplate?.outputSchema).score
        : "",
    },
  });

  // reset the form if the input template changes
  useEffect(() => {
    if (props.existingEvalTemplate) {
      const model = EvalModelNames.parse(props.existingEvalTemplate.model);

      form.reset({
        name: props.existingEvalTemplate.name,
        model: model,
        prompt: props.existingEvalTemplate.prompt,
        variables: props.existingEvalTemplate.vars,
        outputReasoning: OutputSchema.parse(
          props.existingEvalTemplate.outputSchema,
        ).reasoning,
        outputScore: OutputSchema.parse(props.existingEvalTemplate.outputSchema)
          .score,
      });

      // also set the context for the playground
      playgroundContext.updateModelParam("model", model);
      playgroundContext.updateModelParams(
        props.existingEvalTemplate.modelParams,
      );

      const modelProvider = evalModels.find((m) => m.model === model)?.provider;
      if (modelProvider) {
        playgroundContext.updateModelParam("provider", modelProvider);
      }
    }
  }, [props.existingEvalTemplate, form]);

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
        model: EvalModelNames.parse(playgroundContext.modelParams.model),
        modelParameters: playgroundContext.modelParams,
        variables: extractedVariables,
        outputSchema: {
          score: values.outputScore,
          reasoning: values.outputReasoning,
        },
      })
      .then((res) => {
        props.onFormSuccess?.();
        form.reset();
        void router.push(
          `/project/${props.projectId}/evals/templates/${res.id}`,
        );
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
      {JSON.stringify(form.watch(), null, 2)}
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-4 gap-6 gap-x-12"
      >
        <div className="col-span-3 row-span-1">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <>
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Select a template name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </>
            )}
          />
        </div>
        <div className="col-span-1 row-span-3">
          <ModelParameters
            {...playgroundContext}
            availableModels={[...evalModels]}
            disabled={props.existingEvalTemplate !== undefined}
          />
        </div>
        <div className="col-span-3 flex flex-col gap-6">
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
                  <FormDescription>
                    <PromptDescription
                      currentExtractedVariables={extractedVariables}
                    />
                  </FormDescription>
                </FormItem>
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
                  <Input {...field} placeholder="" />
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
