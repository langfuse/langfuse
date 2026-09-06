import { useState } from "react";
import Link from "next/link";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
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
  hasArrayLevelFieldError,
} from "@/src/components/ui/form";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createBooleanEvalOutputDefinition,
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
  MinimumCategoricalCategoryCount,
  type PersistedEvalOutputDefinition,
  PersistedEvalOutputDefinitionSchema,
  ScoreDataTypeEnum,
  extractVariables,
  getIsCharOrUnderscore,
  resolvePersistedEvalOutputDefinition,
  EvalTemplateType,
  EvalTemplateSourceCodeLanguage,
  type EvalTemplate,
  type ModelParams,
  ZodModelConfig,
} from "@langfuse/shared";
import router from "next/router";
import { ModelParameters } from "@/src/components/ModelParameters";
import { PromptVariableListPreview } from "@/src/features/prompts/components/PromptVariableListPreview";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import {
  getDefaultOutputDefinitionFormValues,
  shouldReplaceDefaultOutputDefinitionField,
} from "@/src/features/evals/utils/template-form-defaults";
import { templateFormSchema } from "@/src/features/evals/utils/template-form-schema";
import { CodeMirrorEditor } from "@/src/components/editor";
import { Card, CardContent } from "@/src/components/ui/card";
import { type RouterInput } from "@/src/utils/types";
import { useEvaluationModel } from "@/src/features/evals/hooks/useEvaluationModel";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { ManageDefaultEvalModel } from "@/src/features/evals/components/manage-default-eval-model";
import { DialogFooter, DialogBody } from "@/src/components/ui/dialog";
import { AlertCircle, AlertTriangle, PlusIcon, Trash } from "lucide-react";
import { useValidateCustomModel } from "@/src/features/evals/hooks/useValidateCustomModel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { CodeEvalTemplateFormBody } from "@/src/features/evals/components/code-eval-template-form-body";
import {
  type CodeEvalSourceCodeLanguage,
  getCodeEvalSourceForEditor,
  getDefaultCodeEvalSource,
  formatAndStripCodeEvalSourceForSubmit,
} from "@/src/features/evals/utils/code-eval-template-validation";
import { useCodeEvalSourceValidation } from "@/src/features/evals/hooks/useCodeEvalSourceValidation";
import {
  EvalTemplateTypeSelector,
  type EvalTemplateTypeSelectorMode,
} from "@/src/features/evals/components/eval-template-type-selector";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import {
  useEvalCapabilities,
  type EvalCapabilities,
} from "@/src/features/evals/hooks/useEvalCapabilities";
import { useTranslations } from "next-intl";

type PartialEvalTemplate = Partial<EvalTemplate> &
  Pick<EvalTemplate, "name" | "prompt" | "vars" | "outputDefinition">;

export const EvalTemplateForm = (props: {
  projectId: string;
  useDialog: boolean;
  existingEvalTemplate?: PartialEvalTemplate;
  preFilledFormValues?: EvalTemplateFormPreFill;
  templateTypeSelectorMode?: EvalTemplateTypeSelectorMode;
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
    <div className={props.useDialog ? "max-w-6xl" : "w-full"}>
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
                prompt: props.existingEvalTemplate.prompt ?? "",
                vars: props.existingEvalTemplate.vars,
                outputDefinition: props.existingEvalTemplate
                  .outputDefinition as PersistedEvalOutputDefinition,
                type: props.existingEvalTemplate.type,
                sourceCode: props.existingEvalTemplate.sourceCode,
                sourceCodeLanguage:
                  props.existingEvalTemplate.sourceCodeLanguage ?? undefined,
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
            : props.preFilledFormValues
        }
      />
    </div>
  );
};

const toOutputDefinitionFormValues = (
  outputDefinition?: PersistedEvalOutputDefinition | null,
) => {
  if (!outputDefinition) {
    return getDefaultOutputDefinitionFormValues();
  }

  const resolvedOutputDefinition = resolvePersistedEvalOutputDefinition(
    PersistedEvalOutputDefinitionSchema.parse(outputDefinition),
  );

  return {
    scoreDataType: resolvedOutputDefinition.dataType,
    reasoningDescription: resolvedOutputDefinition.reasoningDescription,
    scoreDescription: resolvedOutputDefinition.scoreDescription,
    shouldAllowMultipleMatches:
      resolvedOutputDefinition.dataType === ScoreDataTypeEnum.CATEGORICAL
        ? resolvedOutputDefinition.shouldAllowMultipleMatches
        : false,
    categories:
      resolvedOutputDefinition.dataType === ScoreDataTypeEnum.CATEGORICAL
        ? resolvedOutputDefinition.categories.map((category) => ({
            value: category,
          }))
        : [],
  };
};

export type EvalTemplateFormPreFill = {
  name: string;
  type?: EvalTemplateType;
  prompt: string;
  vars: string[];
  outputDefinition?: PersistedEvalOutputDefinition | null;
  sourceCode?: string | null;
  sourceCodeLanguage?: CodeEvalSourceCodeLanguage | null;
  selectedModel?: {
    provider: string;
    model: string;
    modelParams: ModelParams & {
      maxTemperature: number;
    };
  };
  shouldUseDefaultModel?: boolean;
};

const InnerEvalTemplateForm = (props: {
  projectId: string;
  useDialog: boolean;
  // pre-filled values from langfuse-defined template or template from db
  preFilledFormValues?: EvalTemplateFormPreFill;
  templateTypeSelectorMode?: EvalTemplateTypeSelectorMode;
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
  const t = useTranslations("evaluationAnalytics.evaluations");
  const capture = usePostHogClientCapture();
  const [formError, setFormError] = useState<string | null>(null);
  const codeEvalCapabilities = useIsCodeEvalEnabled();
  const { enabled: isCodeEvalEnabled } = codeEvalCapabilities;
  const templateTypeSelectorMode = props.templateTypeSelectorMode ?? "all";
  const selectedModelSchema = z.object({
    provider: z.string().min(1, t("templateForm.selectProvider")),
    model: z.string().min(1, t("templateForm.selectModel")),
    modelParams: ZodModelConfig,
  });

  // Determine if we should use default model or custom model
  // If existing template has no provider, it was using default model
  const shouldUseDefaultModel =
    props.preFilledFormValues?.shouldUseDefaultModel ??
    !props.preFilledFormValues?.selectedModel;

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
    providerModelCombinations,
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

  const outputDefinitionFormValues = toOutputDefinitionFormValues(
    props.preFilledFormValues?.outputDefinition,
  );
  const defaultSourceCodeLanguage =
    props.preFilledFormValues?.sourceCodeLanguage ??
    EvalTemplateSourceCodeLanguage.TYPESCRIPT;

  // updates the form based on the pre-filled data
  // either form update or from langfuse-generated template
  const form = useForm({
    resolver: zodResolver(templateFormSchema),
    disabled: !props.isEditing,
    defaultValues: {
      name:
        props.existingEvalTemplateName ?? props.preFilledFormValues?.name ?? "",
      type:
        templateTypeSelectorMode === "code-only"
          ? EvalTemplateType.CODE
          : (props.preFilledFormValues?.type ?? EvalTemplateType.LLM_AS_JUDGE),
      prompt: props.preFilledFormValues?.prompt ?? undefined,
      variables: props.preFilledFormValues?.vars ?? [],
      sourceCode: props.preFilledFormValues?.sourceCode
        ? getCodeEvalSourceForEditor({
            sourceCode: props.preFilledFormValues.sourceCode,
            sourceCodeLanguage: defaultSourceCodeLanguage,
          })
        : getDefaultCodeEvalSource(defaultSourceCodeLanguage),
      sourceCodeLanguage: defaultSourceCodeLanguage,
      scoreDataType: outputDefinitionFormValues.scoreDataType,
      reasoningDescription: outputDefinitionFormValues.reasoningDescription,
      scoreDescription: outputDefinitionFormValues.scoreDescription,
      categories: outputDefinitionFormValues.categories,
      shouldAllowMultipleMatches:
        outputDefinitionFormValues.shouldAllowMultipleMatches,
      shouldUseDefaultModel,
    },
  });

  const {
    fields: categoryFields,
    append,
    remove,
    replace,
  } = useFieldArray({
    control: form.control,
    name: "categories",
  });

  const useDefaultModel = form.watch("shouldUseDefaultModel");
  const evalTemplateType = form.watch("type");
  const sourceCodeLanguage =
    form.watch("sourceCodeLanguage") ??
    EvalTemplateSourceCodeLanguage.TYPESCRIPT;
  const sourceCode = form.watch("sourceCode") ?? "";
  const showCodeTemplateForm =
    isCodeEvalEnabled && evalTemplateType === EvalTemplateType.CODE;
  const evalCapabilities = useEvalCapabilities(props.projectId, {
    isCodeEvalTemplate: showCodeTemplateForm,
  });
  const {
    isValid: isCodeEvalSourceValid,
    validationResult: codeValidationResult,
    validate: validateCodeEvalSource,
    reset: resetCodeEvalSourceValidation,
  } = useCodeEvalSourceValidation({
    enabled: showCodeTemplateForm,
    sourceCode,
    sourceCodeLanguage,
  });
  const scoreDataType = form.watch("scoreDataType");
  const isCategoricalOutput = scoreDataType === ScoreDataTypeEnum.CATEGORICAL;
  const isBooleanOutput = scoreDataType === ScoreDataTypeEnum.BOOLEAN;
  const shouldAllowMultipleMatches = form.watch("shouldAllowMultipleMatches");
  const hasCategoriesArrayError = hasArrayLevelFieldError(
    form.formState.errors.categories,
  );

  const applyDefaultOutputDefinitionCopy = (params: {
    scoreDataType:
      | typeof ScoreDataTypeEnum.NUMERIC
      | typeof ScoreDataTypeEnum.BOOLEAN
      | typeof ScoreDataTypeEnum.CATEGORICAL;
    shouldAllowMultipleMatches: boolean;
  }) => {
    const defaults = getDefaultOutputDefinitionFormValues(params);

    if (
      shouldReplaceDefaultOutputDefinitionField({
        currentValue: form.getValues("reasoningDescription"),
        field: "reasoningDescription",
      })
    ) {
      form.setValue("reasoningDescription", defaults.reasoningDescription);
    }

    if (
      shouldReplaceDefaultOutputDefinitionField({
        currentValue: form.getValues("scoreDescription"),
        field: "scoreDescription",
      })
    ) {
      form.setValue("scoreDescription", defaults.scoreDescription);
    }
  };

  const promptValue = form.watch("prompt");
  const extractedVariables = promptValue
    ? extractVariables(promptValue).filter(getIsCharOrUnderscore)
    : undefined;

  const utils = api.useUtils();
  const createEvalTemplateMutation = api.evals.createTemplate.useMutation({
    onSuccess: (data) => {
      utils.models.invalidate();
      if (data.updatedConfigCount > 0) {
        showSuccessToast({
          title: t("templateForm.updatedEvaluators"),
          description: t("templateForm.updatedEvaluatorsDescription"),
        });
      }
    },
    onError: (error) => setFormError(error.message),
  });

  const isNewTemplate = !props.existingEvalTemplateId && !props.cloneSourceId;
  const existingTemplatesQuery = api.evals.allTemplates.useQuery(
    { projectId: props.projectId },
    {
      enabled: isNewTemplate,
    },
  );
  // keep the latest version per name so the error message links to the current template
  const existingTemplateByName = new Map<
    string,
    { id: string; version: number }
  >();
  for (const template of existingTemplatesQuery.data?.templates ?? []) {
    if (template.projectId !== props.projectId) continue;
    const existing = existingTemplateByName.get(template.name);
    if (!existing || template.version > existing.version) {
      existingTemplateByName.set(template.name, {
        id: template.id,
        version: template.version,
      });
    }
  }
  const getExistingTemplateForName = (name: string) =>
    isNewTemplate ? existingTemplateByName.get(name.trim()) : undefined;

  const getCreateTemplateIntent = () => {
    if (props.existingEvalTemplateId) {
      return {
        intent: "new-version" as const,
        sourceTemplateId: props.existingEvalTemplateId,
      };
    }

    if (props.cloneSourceId) {
      return {
        intent: "clone" as const,
        cloneSourceId: props.cloneSourceId,
      };
    }

    return { intent: "new" as const };
  };

  async function submitEvalTemplate(
    evalTemplate: RouterInput["evals"]["createTemplate"],
  ) {
    // Check if we need to perform any pre-submission validation or confirmation
    if (props.onBeforeSubmit && !props.onBeforeSubmit(evalTemplate)) {
      return; // Stop submission - the parent will handle it
    }

    await createEvalTemplateMutation
      .mutateAsync(evalTemplate)
      .then((res) => {
        props.onFormSuccess?.(res.template);
        form.reset();
        props.setIsEditing?.(false);
        if (props.preventRedirect) {
          return;
        }
        router.push(
          `/project/${props.projectId}/evals/templates/${res.template.id}`,
        );
      })
      .catch((error) => {
        // The mutation's local onError owns the form UX; this owns
        // classification + Sentry capture.
        reportTrpcErrorWithoutToast(error, "evals");
        if ("message" in error && typeof error.message === "string") {
          setFormError(error.message as string);
          return;
        }
        setFormError(JSON.stringify(error));
      });
  }

  async function onSubmit(values: z.infer<typeof templateFormSchema>) {
    capture(
      props.isEditing
        ? "eval_templates:update_form_submit"
        : "eval_templates:new_form_submit",
    );

    if (getExistingTemplateForName(values.name)) {
      form.setError("name", {
        type: "validate",
        message: t("templateForm.duplicateNameError"),
      });
      return;
    }

    if (values.type === EvalTemplateType.CODE) {
      const submittedSourceCodeLanguage =
        values.sourceCodeLanguage ?? EvalTemplateSourceCodeLanguage.TYPESCRIPT;
      const isValidSource = await validateCodeEvalSource({
        sourceCode: values.sourceCode ?? "",
        sourceCodeLanguage: submittedSourceCodeLanguage,
      });

      if (!isValidSource) {
        return;
      }

      const formattedSourceCode = await formatAndStripCodeEvalSourceForSubmit({
        sourceCode: values.sourceCode ?? "",
        sourceCodeLanguage: submittedSourceCodeLanguage,
      });

      const evalTemplate = {
        type: EvalTemplateType.CODE,
        name: values.name,
        projectId: props.projectId,
        sourceCode: formattedSourceCode,
        sourceCodeLanguage: submittedSourceCodeLanguage,
        ...getCreateTemplateIntent(),
      } satisfies RouterInput["evals"]["createTemplate"];

      await submitEvalTemplate(evalTemplate);
      return;
    }

    const outputDefinition =
      values.scoreDataType === ScoreDataTypeEnum.CATEGORICAL
        ? createCategoricalEvalOutputDefinition({
            scoreDescription: values.scoreDescription ?? "",
            reasoningDescription: values.reasoningDescription ?? "",
            categories: values.categories.map((category) => category.value),
            shouldAllowMultipleMatches: values.shouldAllowMultipleMatches,
          })
        : values.scoreDataType === ScoreDataTypeEnum.BOOLEAN
          ? createBooleanEvalOutputDefinition({
              scoreDescription: values.scoreDescription ?? "",
              reasoningDescription: values.reasoningDescription ?? "",
            })
          : createNumericEvalOutputDefinition({
              scoreDescription: values.scoreDescription ?? "",
              reasoningDescription: values.reasoningDescription ?? "",
            });

    const evalTemplate = {
      type: EvalTemplateType.LLM_AS_JUDGE,
      name: values.name,
      projectId: props.projectId,
      prompt: values.prompt ?? "",
      // Only include model details if not using default model
      provider: values.shouldUseDefaultModel
        ? undefined
        : modelParams.provider.value,
      model: values.shouldUseDefaultModel ? undefined : modelParams.model.value,
      modelParams: values.shouldUseDefaultModel
        ? undefined
        : getFinalModelParams(modelParams),
      vars: extractedVariables ?? [],
      outputDefinition,
      ...getCreateTemplateIntent(),
    } satisfies RouterInput["evals"]["createTemplate"];

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
        setFormError(t("templateForm.noDefaultModelError"));
        return;
      }
    }

    await submitEvalTemplate(evalTemplate);
  }

  const formBody = (
    <>
      {!props.existingEvalTemplateId ? (
        <>
          <div className="col-span-1 row-span-1 lg:col-span-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => {
                const existingTemplate = getExistingTemplateForName(
                  field.value,
                );
                return (
                  <FormItem>
                    <FormLabel>{t("templateForm.name")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("templateForm.selectName")}
                      />
                    </FormControl>
                    {existingTemplate && (
                      <p className="text-destructive text-sm font-bold">
                        {t.rich("templateForm.duplicateNameDescription", {
                          edit: (chunks) => (
                            <Link
                              href={`/project/${props.projectId}/evals/templates/${existingTemplate.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              {chunks}
                            </Link>
                          ),
                        })}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>
          <div className="col-span-1 row-span-1 lg:col-span-0"></div>
        </>
      ) : undefined}

      <EvalTemplateTypeSelector
        form={form}
        codeEvalCapabilities={codeEvalCapabilities}
        mode={templateTypeSelectorMode}
        hasExistingTemplate={Boolean(props.existingEvalTemplateId)}
        onChange={() => {
          resetCodeEvalSourceValidation();
          setFormError(null);
        }}
      />

      {showCodeTemplateForm ? (
        <div className="space-y-3">
          {props.isEditing ? (
            <CodeEvalSdkVersionCallout evalCapabilities={evalCapabilities} />
          ) : null}
          <FormField
            control={form.control}
            name="sourceCode"
            render={({ field }) => (
              <CodeEvalTemplateFormBody
                sourceCode={field.value ?? ""}
                sourceCodeLanguage={sourceCodeLanguage}
                onSourceCodeChange={(value) => {
                  field.onChange(value);
                  setFormError(null);
                }}
                editable={Boolean(props.isEditing)}
                validationResult={codeValidationResult}
                ctxSample={null}
              />
            )}
          />
        </div>
      ) : (
        <>
          {/* Model Selection Section */}
          <Card>
            <CardContent>
              <p className="my-2 font-bold">{t("templateForm.model")}</p>
              <FormField
                control={form.control}
                name="shouldUseDefaultModel"
                render={({ field }) => (
                  <FormItem className="mt-3 flex flex-row items-center space-y-0 space-x-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!props.isEditing}
                      />
                    </FormControl>
                    <div className="space-y-0 leading-none">
                      <FormLabel>{t("templateForm.useDefaultModel")}</FormLabel>
                      <FormDescription className="text-xs">
                        <ManageDefaultEvalModel
                          projectId={props.projectId}
                          variant="color-coded"
                          setUpMessage={
                            <>
                              {t("templateForm.noDefaultModelDescription")}{" "}
                              <a
                                href="https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge#how-llm-as-a-judge-works"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                {t("learnMore")}
                              </a>
                            </>
                          }
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
                  <div className="text-destructive mt-2 flex items-center space-x-1 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <p>
                      {t("templateForm.missingApiKey", {
                        provider: modelParams.provider.value,
                      })}
                    </p>
                  </div>
                ) : (
                  <ModelParameters
                    customHeader={
                      <p className="text-sm leading-none font-bold">
                        {t("templateForm.customModelConfiguration")}
                      </p>
                    }
                    {...{
                      modelParams,
                      availableModels,
                      providerModelCombinations,
                      availableProviders,
                      updateModelParamValue: updateModelParamValue,
                      setModelParamEnabled,
                      modelParamsDescription: t("selectFunctionCallingModel"),
                    }}
                    formDisabled={!props.isEditing}
                  />
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <p className="my-2 font-bold">{t("templateForm.prompt")}</p>
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <>
                      <FormItem>
                        <FormLabel>{t("evaluationPrompt")}</FormLabel>
                        <FormDescription>
                          {t("templateForm.promptDescription", {
                            variable: "{{input}}",
                          })}
                        </FormDescription>
                        <FormControl>
                          <CodeMirrorEditor
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            editable={props.isEditing}
                            mode="prompt"
                            minHeight={200}
                            maxHeight="50dvh"
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
                name="scoreDataType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("templateForm.scoreType")}</FormLabel>
                    <FormDescription>
                      {t("templateForm.scoreTypeDescription")}
                    </FormDescription>
                    <Select
                      value={field.value}
                      disabled={!props.isEditing}
                      onValueChange={(value) => {
                        const nextScoreDataType = value as
                          | typeof ScoreDataTypeEnum.NUMERIC
                          | typeof ScoreDataTypeEnum.BOOLEAN
                          | typeof ScoreDataTypeEnum.CATEGORICAL;
                        const shouldEnableMultipleMatches =
                          nextScoreDataType === ScoreDataTypeEnum.CATEGORICAL
                            ? form.getValues("shouldAllowMultipleMatches")
                            : false;

                        field.onChange(nextScoreDataType);

                        if (
                          nextScoreDataType === ScoreDataTypeEnum.CATEGORICAL &&
                          (form.getValues("categories") ?? []).length === 0
                        ) {
                          replace(
                            Array.from(
                              { length: MinimumCategoricalCategoryCount },
                              () => ({ value: "" }),
                            ),
                          );
                        }

                        if (
                          nextScoreDataType !== ScoreDataTypeEnum.CATEGORICAL
                        ) {
                          form.setValue("shouldAllowMultipleMatches", false);
                        }

                        applyDefaultOutputDefinitionCopy({
                          scoreDataType: nextScoreDataType,
                          shouldAllowMultipleMatches:
                            shouldEnableMultipleMatches ?? false,
                        });
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("templateForm.selectScoreType")}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={ScoreDataTypeEnum.NUMERIC}>
                          {t("templateForm.numeric")}
                        </SelectItem>
                        <SelectItem value={ScoreDataTypeEnum.BOOLEAN}>
                          {t("templateForm.boolean")}
                        </SelectItem>
                        <SelectItem value={ScoreDataTypeEnum.CATEGORICAL}>
                          {t("templateForm.categorical")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isCategoricalOutput ? (
                <FormField
                  control={form.control}
                  name="categories"
                  render={() => (
                    <FormItem>
                      <div>
                        <FormLabel>{t("templateForm.categories")}</FormLabel>
                        <FormDescription>
                          {t("templateForm.categoriesDescription")}
                        </FormDescription>
                      </div>
                      <div className="space-y-3">
                        {categoryFields.map((field, index) => (
                          <div
                            key={field.id}
                            className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]"
                          >
                            <FormField
                              control={form.control}
                              name={`categories.${index}.value`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-muted-foreground text-xs">
                                    {t("templateForm.category")}
                                  </FormLabel>
                                  <FormControl>
                                    <Input {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="flex items-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={!props.isEditing}
                                onClick={() => remove(index)}
                                aria-label={t("templateForm.removeCategory", {
                                  index: index + 1,
                                })}
                              >
                                <Trash className="text-muted-foreground h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="text-muted-foreground"
                        disabled={!props.isEditing}
                        onClick={() => append({ value: "" })}
                      >
                        <PlusIcon className="mr-1.5 h-4 w-4" />
                        {t("templateForm.addCategory")}
                      </Button>
                      <FormField
                        control={form.control}
                        name="shouldAllowMultipleMatches"
                        render={({ field }) => (
                          <FormItem className="mt-3 flex flex-row items-center space-y-0 space-x-3">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={(checked) => {
                                  field.onChange(checked);
                                  applyDefaultOutputDefinitionCopy({
                                    scoreDataType:
                                      ScoreDataTypeEnum.CATEGORICAL,
                                    shouldAllowMultipleMatches:
                                      Boolean(checked),
                                  });
                                }}
                                disabled={!props.isEditing}
                              />
                            </FormControl>
                            <div className="space-y-0.5 leading-none">
                              <FormLabel>
                                {t("templateForm.allowMultipleMatches")}
                              </FormLabel>
                              <FormDescription>
                                {t(
                                  "templateForm.allowMultipleMatchesDescription",
                                )}
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      {hasCategoriesArrayError ? <FormMessage /> : null}
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name="reasoningDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("templateForm.scoreReasoningPrompt")}
                    </FormLabel>
                    <FormDescription>
                      {t("templateForm.scoreReasoningDescription")}
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
                name="scoreDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {isCategoricalOutput
                        ? t("templateForm.categorySelectionPrompt")
                        : isBooleanOutput
                          ? t("templateForm.booleanVerdictPrompt")
                          : t("templateForm.scoreOutputPrompt")}
                    </FormLabel>
                    <FormDescription>
                      {isCategoricalOutput
                        ? shouldAllowMultipleMatches
                          ? t("templateForm.multipleCategoryPromptDescription")
                          : t("templateForm.singleCategoryPromptDescription")
                        : isBooleanOutput
                          ? t("templateForm.booleanPromptDescription")
                          : t("templateForm.numericPromptDescription")}
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
      )}
    </>
  );

  const formFooter = (
    <div className="flex w-full flex-col items-end gap-4">
      {props.isEditing && (
        <Button
          type="submit"
          loading={createEvalTemplateMutation.isPending}
          disabled={showCodeTemplateForm && !isCodeEvalSourceValid}
          className="w-full"
        >
          {t("save")}
        </Button>
      )}
      {formError ? (
        <p className="text-destructive text-sm">{formError}</p>
      ) : null}
    </div>
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mt-2 w-full space-y-4"
      >
        {props.useDialog ? <DialogBody>{formBody}</DialogBody> : formBody}

        {props.useDialog ? (
          <DialogFooter variant="action">{formFooter}</DialogFooter>
        ) : (
          formFooter
        )}
      </form>
    </Form>
  );
};

function CodeEvalSdkVersionCallout({
  evalCapabilities,
}: {
  evalCapabilities: EvalCapabilities;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");

  if (
    evalCapabilities.isLoading ||
    !evalCapabilities.compatibilityCheckWasPerformed ||
    evalCapabilities.isNewCompatible
  ) {
    return null;
  }

  return (
    <Alert
      variant="default"
      className="border-dark-yellow bg-light-yellow max-w-4xl"
    >
      <AlertTriangle className="text-dark-yellow h-4 w-4" />
      <AlertDescription>
        <div className="flex flex-col gap-1">
          <span className="text-foreground font-bold">
            {t("templateForm.verifySdkVersion")}
          </span>
          <span className="text-foreground text-sm">
            {t.rich("templateForm.sdkVersionDescription", {
              link: (chunks) => (
                <a
                  href="https://langfuse.com/docs/observability/sdk/upgrade-path"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dark-blue font-bold hover:opacity-80"
                >
                  {chunks}
                </a>
              ),
            })}
          </span>
        </div>
      </AlertDescription>
    </Alert>
  );
}
