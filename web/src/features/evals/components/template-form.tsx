import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
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
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { extractVariables, getIsCharOrUnderscore } from "@langfuse/shared";
import router from "next/router";
import { type EvalTemplate } from "@langfuse/shared";
import { ModelParameters } from "@/src/components/ModelParameters";
import {
  OutputSchema,
  type ModelParams,
  ZodModelConfig,
} from "@langfuse/shared";
import { PromptVariableListPreview } from "@/src/features/prompts/components/PromptVariableListPreview";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { EvalReferencedEvaluators } from "@/src/features/evals/types";
import { CodeMirrorEditor } from "@/src/components/editor";
import { Card, CardContent } from "@/src/components/ui/card";
import { type RouterInput } from "@/src/utils/types";
import { useEvaluationModel } from "@/src/features/evals/hooks/useEvaluationModel";
import { Checkbox } from "@/src/components/ui/checkbox";
import { ManageDefaultEvalModel } from "@/src/features/evals/components/manage-default-eval-model";
import { DialogFooter, DialogBody } from "@/src/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import { useValidateCustomModel } from "@/src/features/evals/hooks/useValidateCustomModel";

type PartialEvalTemplate = Omit<
  EvalTemplate,
  "id" | "version" | "createdAt" | "updatedAt"
> & { id?: string };

export const EvalTemplateForm = (props: {
  projectId: string;
  useDialog: boolean;
  existingEvalTemplate?: PartialEvalTemplate;
  onFormSuccess?: (template?: EvalTemplate) => void;
  onBeforeSubmit?: (
    template: RouterInput["evals"]["createTemplate"],
  ) => boolean;
  isEditing?: boolean;
  setIsEditing?: (isEditing: boolean) => void;
  preventRedirect?: boolean;
  cloneSourceId?: string | null;
}) => {
  return (
    <div className="w-full">
      <InnerEvalTemplateForm
        key={props.existingEvalTemplate?.id ?? "new"}
        {...props}
        existingEvalTemplateId={props.existingEvalTemplate?.id}
        existingEvalTemplateName={props.existingEvalTemplate?.name}
        cloneSourceId={props.cloneSourceId}
        onBeforeSubmit={props.onBeforeSubmit}
        preFilledFormValues={
          // if a langfuse template is selected, use that, else use the existing template
          // no langfuse template is selected if there is already an existing template
          props.existingEvalTemplate
            ? {
                name: props.existingEvalTemplate.name,
                prompt: props.existingEvalTemplate.prompt,
                vars: props.existingEvalTemplate.vars,
                outputSchema: props.existingEvalTemplate.outputSchema as {
                  score: string;
                  reasoning: string;
                },
                selectedModel: props.existingEvalTemplate.provider
                  ? {
                      provider: props.existingEvalTemplate.provider as string,
                      model: props.existingEvalTemplate.model as string,
                      modelParams: props.existingEvalTemplate
                        .modelParams as ModelParams & {
                        maxTemperature: number;
                      },
                    }
                  : undefined,
              }
            : undefined
        }
      />
    </div>
  );
};

const selectedModelSchema = z.object({
  provider: z.string().min(1, "Select a provider"),
  model: z.string().min(1, "Select a model"),
  modelParams: ZodModelConfig,
});

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
  referencedEvaluators: z
    .enum(EvalReferencedEvaluators)
    .optional()
    .default(EvalReferencedEvaluators.PERSIST),
  shouldUseDefaultModel: z.boolean().default(true),
});

export type EvalTemplateFormPreFill = {
  name: string;
  prompt: string;
  vars: string[];
  outputSchema: {
    score: string;
    reasoning: string;
  };
  selectedModel?: {
    provider: string;
    model: string;
    modelParams: ModelParams & {
      maxTemperature: number;
    };
  };
};

export const InnerEvalTemplateForm = (props: {
  projectId: string;
  useDialog: boolean;
  // pre-filled values from langfuse-defined template or template from db
  preFilledFormValues?: EvalTemplateFormPreFill;
  // template to be updated
  existingEvalTemplateId?: string;
  existingEvalTemplateName?: string;
  onFormSuccess?: (template?: EvalTemplate) => void;
  onBeforeSubmit?: (template: any) => boolean;
  isEditing?: boolean;
  setIsEditing?: (isEditing: boolean) => void;
  preventRedirect?: boolean;
  cloneSourceId?: string | null;
}) => {
  const capture = usePostHogClientCapture();
  const [formError, setFormError] = useState<string | null>(null);

  // Determine if we should use default model or custom model
  // If existing template has no provider, it was using default model
  const isExistingUsingDefault = props.preFilledFormValues?.selectedModel
    ? false
    : true;

  const { data: defaultModel } = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId: props.projectId },
    { enabled: !!props.projectId },
  );

  // updates the model params based on the pre-filled data
  // either form update or from langfuse-generated template
  const {
    modelParams,
    setModelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableModels,
    availableProviders,
  } = useModelParams();

  useEvaluationModel(
    props.projectId,
    setModelParams,
    props.preFilledFormValues?.selectedModel,
  );

  const { isCustomModelValid } = useValidateCustomModel(
    availableProviders,
    props.preFilledFormValues?.selectedModel,
  );

  // updates the form based on the pre-filled data
  // either form update or from langfuse-generated template
  const form = useForm({
    resolver: zodResolver(formSchema),
    disabled: !props.isEditing,
    defaultValues: {
      name:
        props.existingEvalTemplateName ?? props.preFilledFormValues?.name ?? "",
      prompt: props.preFilledFormValues?.prompt ?? undefined,
      variables: props.preFilledFormValues?.vars ?? [],
      outputReasoning: props.preFilledFormValues
        ? OutputSchema.parse(props.preFilledFormValues?.outputSchema).reasoning
        : "One sentence reasoning for the score",
      outputScore: props.preFilledFormValues
        ? OutputSchema.parse(props.preFilledFormValues?.outputSchema).score
        : "Score between 0 and 1. Score 0 if false or negative and 1 if true or positive.",
      shouldUseDefaultModel: isExistingUsingDefault,
    },
  });

  const useDefaultModel = form.watch("shouldUseDefaultModel");

  const extractedVariables = form.watch("prompt")
    ? extractVariables(form.watch("prompt")).filter(getIsCharOrUnderscore)
    : undefined;

  const utils = api.useUtils();
  const createEvalTemplateMutation = api.evals.createTemplate.useMutation({
    onSuccess: () => {
      utils.models.invalidate();
      if (
        form.getValues("referencedEvaluators") ===
          EvalReferencedEvaluators.UPDATE &&
        props.existingEvalTemplateId
      ) {
        showSuccessToast({
          title: "Updated evaluators",
          description:
            "Updated referenced evaluators to use new template version.",
        });
      }
    },
    onError: (error) => setFormError(error.message),
  });

  const evaluatorsByTemplateNameQuery =
    api.evals.jobConfigsByTemplateName.useQuery(
      {
        projectId: props.projectId,
        evalTemplateName: props.existingEvalTemplateName as string,
      },
      {
        enabled: !!props.existingEvalTemplateName,
      },
    );

  useEffect(() => {
    if (evaluatorsByTemplateNameQuery.data) {
      form.setValue(
        "referencedEvaluators",
        Boolean(evaluatorsByTemplateNameQuery.data.evaluators.length)
          ? EvalReferencedEvaluators.UPDATE
          : EvalReferencedEvaluators.PERSIST,
      );
    }
  }, [evaluatorsByTemplateNameQuery.data, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    capture(
      props.isEditing
        ? "eval_templates:update_form_submit"
        : "eval_templates:new_form_submit",
    );

    const evalTemplate = {
      name: values.name,
      projectId: props.projectId,
      prompt: values.prompt,
      // Only include model details if not using default model
      provider: values.shouldUseDefaultModel
        ? undefined
        : modelParams.provider.value,
      model: values.shouldUseDefaultModel ? undefined : modelParams.model.value,
      modelParams: values.shouldUseDefaultModel
        ? undefined
        : getFinalModelParams(modelParams),
      vars: extractedVariables ?? [],
      outputSchema: {
        score: values.outputScore,
        reasoning: values.outputReasoning,
      },
      referencedEvaluators: values.referencedEvaluators,
      sourceTemplateId: props.cloneSourceId ?? undefined,
    };

    // Only validate model if not using default
    if (!values.shouldUseDefaultModel) {
      const parsedModel = selectedModelSchema.safeParse({
        provider: evalTemplate.provider,
        model: evalTemplate.model,
        modelParams: evalTemplate.modelParams,
      });

      if (!parsedModel.success) {
        setFormError(
          `${parsedModel.error.issues[0].path}: ${parsedModel.error.issues[0].message}`,
        );
        return;
      }
    } else {
      if (!defaultModel) {
        setFormError(
          "No default evaluation model set. Set up default evaluation model or use a custom model",
        );
        return;
      }
    }

    // Check if we need to perform any pre-submission validation or confirmation
    if (props.onBeforeSubmit && !props.onBeforeSubmit(evalTemplate)) {
      return; // Stop submission - the parent will handle it
    }

    createEvalTemplateMutation
      .mutateAsync(evalTemplate)
      .then((res) => {
        props.onFormSuccess?.(res);
        form.reset();
        props.setIsEditing?.(false);
        if (props.preventRedirect) {
          return;
        }
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

  const formBody = (
    <>
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
                      <Input {...field} placeholder="Select a template name" />
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

      {/* Model Selection Section */}
      <Card>
        <CardContent>
          <p className="my-2 font-semibold">Model</p>
          <FormField
            control={form.control}
            name="shouldUseDefaultModel"
            render={({ field }) => (
              <FormItem className="mt-3 flex flex-row items-center space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!props.isEditing}
                  />
                </FormControl>
                <div className="space-y-0 leading-none">
                  <FormLabel>Use default evaluation model</FormLabel>
                  <FormDescription className="text-xs">
                    <ManageDefaultEvalModel
                      projectId={props.projectId}
                      variant="color-coded"
                      setUpMessage="No default model set. Set up default evaluation model"
                      className="text-sm font-normal"
                    />
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
          {/* Only show model parameters if using custom model */}
          {!useDefaultModel &&
            (!props.isEditing && !isCustomModelValid ? (
              <div className="mt-2 flex items-center space-x-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <p>
                  This evaluator is configured to use{" "}
                  {modelParams.provider.value}s models but no API key exists.
                  Add a key or choose another provider.
                </p>
              </div>
            ) : (
              <ModelParameters
                customHeader={
                  <p className="text-sm font-medium leading-none">
                    Custom model configuration
                  </p>
                }
                {...{
                  modelParams,
                  availableModels,
                  availableProviders,
                  updateModelParamValue: updateModelParamValue,
                  setModelParamEnabled,
                  modelParamsDescription:
                    "Select a model which supports function calling.",
                }}
                formDisabled={!props.isEditing}
              />
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="my-2 font-semibold">Prompt</p>
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <>
                  <FormItem>
                    <FormLabel>Evaluation prompt</FormLabel>
                    <FormDescription>
                      Define your llm-as-a-judge evaluation template. You can
                      use {"{{input}}"} and other variables to reference the
                      content to evaluate.
                    </FormDescription>
                    <FormControl>
                      <CodeMirrorEditor
                        value={field.value}
                        onChange={field.onChange}
                        editable={props.isEditing}
                        mode="prompt"
                        minHeight={200}
                      />
                    </FormControl>
                    <FormMessage />
                    <PromptVariableListPreview
                      variables={extractedVariables ?? []}
                    />
                  </FormItem>
                </>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="outputReasoning"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Score reasoning prompt</FormLabel>
                <FormDescription>
                  Define how the LLM should explain its evaluation. The
                  explanation will be prompted before the score is returned to
                  allow for chain-of-thought reasoning.
                </FormDescription>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="outputScore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Score range prompt</FormLabel>
                <FormDescription>
                  Define how the LLM should return the evaluation score in
                  natural language. Needs to yield a numeric value.
                </FormDescription>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </>
  );

  const formFooter = (
    <div className="flex w-full flex-col items-end gap-4">
      {props.isEditing && (
        <Button
          type="submit"
          loading={createEvalTemplateMutation.isLoading}
          className="max-w-fit"
        >
          Save
        </Button>
      )}
      {formError ? (
        <p className="text-red w-full text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </div>
  );

  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="mt-2 space-y-4"
      >
        {props.useDialog ? <DialogBody>{formBody}</DialogBody> : formBody}

        {props.useDialog ? (
          <DialogFooter>{formFooter}</DialogFooter>
        ) : (
          formFooter
        )}
      </form>
    </Form>
  );
};
