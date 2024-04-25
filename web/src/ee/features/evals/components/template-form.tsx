import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
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
import { type RouterOutputs, api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { extractVariables, getIsCharOrUnderscore } from "@/src/utils/string";
import router from "next/router";
import { type EvalTemplate } from "@prisma/client";
import {
  ModelParameters,
  type ModelParamsContext,
} from "@/src/components/ModelParameters";
import {
  EvalModelNames,
  OutputSchema,
  evalLLMModels,
  type UIModelParams,
  ModelProvider,
  type OpenAIModel,
  type OpenAIModelParams,
} from "@langfuse/shared";
import { PromptDescription } from "@/src/features/prompts/components/prompt-description";
import Link from "next/dist/client/link";
import { ArrowTopRightIcon } from "@radix-ui/react-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { TEMPLATES } from "@/src/ee/features/evals/components/templates";
import { Label } from "@/src/components/ui/label";

const formSchema = z.object({
  name: z.string().min(1, "Enter a name"),
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
  outputScore: z.string().min(1, "Enter a score function"),
  outputReasoning: z.string().min(1, "Enter a reasoning function"),
});

export const EvalTemplateForm = (props: {
  projectId: string;
  existingEvalTemplate?: EvalTemplate;
  apiKeys: RouterOutputs["llmApiKey"]["all"]["data"];
  onFormSuccess?: () => void;
  isEditing?: boolean;
  setIsEditing?: (isEditing: boolean) => void;
}) => {
  const [langfuseTemplate, setLangfuseTemplate] = useState<string | null>(null);

  const updateLangfuseTemplate = (name: string) => {
    setLangfuseTemplate(name);
  };

  const currentTemplate = TEMPLATES.find(
    (template) => template.name === langfuseTemplate,
  );

  return (
    <div className="grid grid-cols-1 gap-6 gap-x-12 lg:grid-cols-3">
      {props.isEditing ? (
        <div className="col-span-1 lg:col-span-2">
          <Select
            value={langfuseTemplate ?? ""}
            onValueChange={updateLangfuseTemplate}
          >
            <SelectTrigger className="text-gray-700 ring-transparent focus:ring-0 focus:ring-offset-0">
              <SelectValue
                className="text-sm font-semibold text-gray-700"
                placeholder={"Select a Langfuse managed template"}
              />
            </SelectTrigger>
            <SelectContent className="max-h-60 max-w-80">
              {TEMPLATES.map((project) => (
                <SelectItem key={project.name} value={project.name}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="col-span-1 lg:col-span-3">
        <InnerEvalTemplateForm
          {...props}
          existingEvalTemplateId={props.existingEvalTemplate?.id}
          existingEvalTemplateName={props.existingEvalTemplate?.name}
          preFilledFormValues={
            langfuseTemplate
              ? {
                  name: langfuseTemplate.toLocaleLowerCase() ?? "",
                  prompt: currentTemplate?.prompt.trim() ?? "",
                  vars: [],
                  outputSchema: {
                    score: currentTemplate?.outputScore?.trim() ?? "",
                    reasoning: currentTemplate?.outputReasoning?.trim() ?? "",
                  },
                  model: "gpt-3.5-turbo",
                  modelParams: {
                    model: "gpt-3.5-turbo",
                    provider: ModelProvider.OpenAI,
                    temperature: 1,
                    maxTemperature: 2,
                    max_tokens: 256,
                    top_p: 1,
                  },
                }
              : props.existingEvalTemplate
                ? {
                    name: props.existingEvalTemplate.name,
                    prompt: props.existingEvalTemplate.prompt,
                    vars: props.existingEvalTemplate.vars,
                    outputSchema: props.existingEvalTemplate.outputSchema as {
                      score: string;
                      reasoning: string;
                    },
                    model: props.existingEvalTemplate.model as OpenAIModel,
                    modelParams: props.existingEvalTemplate
                      .modelParams as OpenAIModelParams & {
                      maxTemperature: number;
                    },
                  }
                : undefined
          }
        />
      </div>
    </div>
  );
};

export type EvalTemplateFormPreFill = {
  name: string;
  prompt: string;
  vars: string[];
  outputSchema: {
    score: string;
    reasoning: string;
  };
  model: OpenAIModel;
  modelParams: OpenAIModelParams & {
    maxTemperature: number;
  };
};

export const InnerEvalTemplateForm = (props: {
  projectId: string;
  preFilledFormValues?: EvalTemplateFormPreFill;
  apiKeys: RouterOutputs["llmApiKey"]["all"]["data"];
  existingEvalTemplateId?: string;
  existingEvalTemplateName?: string;
  onFormSuccess?: () => void;
  isEditing?: boolean;
  setIsEditing?: (isEditing: boolean) => void;
}) => {
  const posthog = usePostHog();
  const [formError, setFormError] = useState<string | null>(null);

  const [modelParams, setModelParams] = useState<UIModelParams>({
    model: props.preFilledFormValues?.model ?? "gpt-3.5-turbo",
    provider:
      props.preFilledFormValues?.modelParams.provider ?? ModelProvider.OpenAI,
    max_tokens: props.preFilledFormValues?.modelParams.max_tokens ?? 100,
    maxTemperature:
      props.preFilledFormValues?.modelParams.maxTemperature ?? 0.5,
    top_p: props.preFilledFormValues?.modelParams.top_p ?? 1,
    temperature: props.preFilledFormValues?.modelParams.temperature ?? 0.5,
  });

  const updateModelParam: ModelParamsContext["updateModelParam"] = (
    key,
    value,
  ) => {
    setModelParams((prev) => ({ ...prev, [key]: value }));
  };

  const getModelProvider = (model: string) => {
    return evalLLMModels.find((m) => m.model === model)?.provider;
  };

  const getApiKeyForModel = (model: string) => {
    const modelProvider = getModelProvider(model);
    return props.apiKeys.find((k) => k.provider === modelProvider);
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    disabled: !props.isEditing,
    defaultValues: {
      name:
        props.existingEvalTemplateName ?? props.preFilledFormValues?.name ?? "",
      prompt: props.preFilledFormValues?.prompt ?? undefined,
      variables: props.preFilledFormValues?.vars ?? [],
      outputReasoning: props.preFilledFormValues
        ? OutputSchema.parse(props.preFilledFormValues?.outputSchema).reasoning
        : undefined,
      outputScore: props.preFilledFormValues
        ? OutputSchema.parse(props.preFilledFormValues?.outputSchema).score
        : undefined,
    },
  });

  // reset the form if the input template changes
  useEffect(() => {
    if (props.preFilledFormValues) {
      form.reset({
        name: props.existingEvalTemplateName ?? props.preFilledFormValues.name,
        prompt: props.preFilledFormValues.prompt,
        variables: props.preFilledFormValues.vars,
        outputReasoning: OutputSchema.parse(
          props.preFilledFormValues.outputSchema,
        ).reasoning,
        outputScore: OutputSchema.parse(props.preFilledFormValues.outputSchema)
          .score,
      });

      // also set the context for the playground
      const model = EvalModelNames.parse(props.preFilledFormValues.model);
      updateModelParam("model", model);
      setModelParams((prev) => ({
        ...prev,
        ...(props.preFilledFormValues?.modelParams as UIModelParams),
      }));

      const modelProvider = evalLLMModels.find(
        (m) => m.model === model,
      )?.provider;
      if (modelProvider) {
        updateModelParam("provider", modelProvider);
      }
    }
  }, [props.preFilledFormValues, form, props.existingEvalTemplateName]);

  const extractedVariables = form.watch("prompt")
    ? extractVariables(form.watch("prompt")).filter(getIsCharOrUnderscore)
    : undefined;

  const utils = api.useUtils();
  const createEvalTemplateMutation = api.evals.createTemplate.useMutation({
    onSuccess: () => utils.models.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    posthog.capture("evals:new_template_form");

    const model = EvalModelNames.safeParse(modelParams.model);

    if (!model.success) {
      setFormError("Please select a model.");
      return;
    }

    createEvalTemplateMutation
      .mutateAsync({
        name: values.name,
        projectId: props.projectId,
        prompt: values.prompt,
        model: model.data,
        modelParams: modelParams,
        vars: extractedVariables ?? [],
        outputSchema: {
          score: values.outputScore,
          reasoning: values.outputReasoning,
        },
      })
      .then((res) => {
        props.onFormSuccess?.();
        form.reset();
        props.setIsEditing?.(false);
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
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-6 gap-x-12 lg:grid-cols-3"
      >
        {!props.existingEvalTemplateId ? (
          <>
            <div className="col-span-1 row-span-1 lg:col-span-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <>
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Select a template name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  </>
                )}
              />
            </div>
            <div className="lg:col-span-0 col-span-1 row-span-1"></div>
          </>
        ) : undefined}

        <div className="col-span-1 flex flex-col gap-6 lg:col-span-2">
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
                      placeholder="{{input}} Please evaluate the input on toxicity."
                      className="min-h-[350px] flex-1 font-mono text-xs"
                    />
                  </FormControl>
                  <FormMessage />
                  <PromptDescription
                    currentExtractedVariables={extractedVariables ?? []}
                  />
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
                  <Input {...field} placeholder="Score between 0 and 1" />
                </FormControl>
                <FormDescription>
                  We use function calls to extract data from the LLM. Specify
                  what the LLM should return for the score.
                </FormDescription>
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
                  <Input
                    placeholder="One sentence reasoning for the score"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  We use function calls to extract data from the LLM. Specify
                  what the LLM should return for the reasoning.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="col-span-1 row-span-3">
          <div className="flex flex-col gap-6">
            <ModelParameters
              {...{ modelParams, updateModelParam }}
              availableModels={[...evalLLMModels]}
              disabled={!props.isEditing}
            />

            <Label>API key</Label>
            <div>
              {getApiKeyForModel(modelParams.model) ? (
                <span className="mr-2 rounded-sm bg-gray-200 p-1 text-xs">
                  {getApiKeyForModel(modelParams.model)?.displaySecretKey}
                </span>
              ) : undefined}
            </div>
            {/* Custom form message to include a link to the already existing prompt */}
            {!getApiKeyForModel(modelParams.model) ? (
              <div className="flex flex-col text-sm font-medium text-destructive">
                {"No LLM API key found."}

                <Link
                  href={`/project/${props.projectId}/settings`}
                  className="flex flex-row"
                >
                  Create a new API key here. <ArrowTopRightIcon />
                </Link>
              </div>
            ) : undefined}
            <FormDescription>
              The API key is used for each evaluation and will incur costs.
            </FormDescription>
          </div>
        </div>

        {props.isEditing && (
          <Button
            type="submit"
            loading={createEvalTemplateMutation.isLoading}
            className="col-span-1 mt-3 lg:col-span-3"
          >
            Save
          </Button>
        )}
      </form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </Form>
  );
};
