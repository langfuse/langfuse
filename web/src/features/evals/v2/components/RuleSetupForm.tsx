import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ChevronLeft, FlaskConical } from "lucide-react";
import { z } from "zod";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Separator } from "@/src/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { CodeEvalTemplateFormBody } from "@/src/features/evals/components/code-eval-template-form-body";
import { EvaluationPromptPreview } from "@/src/features/evals/components/evaluation-prompt-preview";
import { type PreviewData } from "@/src/features/evals/hooks/usePreviewData";
import {
  SampleCompanion,
  useIsWideScreen,
} from "@/src/features/evals/v2/components/SampleCompanion";
import { useEvaluationModel } from "@/src/features/evals/hooks/useEvaluationModel";
import {
  DEFAULT_PYTHON_CODE_EVAL_SOURCE,
  DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";
import { type VariableMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import { getMaintainer } from "@/src/features/evals/utils/typeHelpers";
import {
  JudgeModelSection,
  type JudgeModelMode,
} from "@/src/features/evals/v2/components/JudgeModelSection";
import {
  PromptVariableEditor,
  type VariableMappingStatus,
} from "@/src/features/evals/v2/components/PromptVariableEditor";
import {
  DEFAULT_RUN_SCOPE_STATE,
  generateRunScopeName,
  RunScopeSection,
  type RunScopeFormState,
} from "@/src/features/evals/v2/components/RunScopeSection";
import {
  SampleTracePanel,
  SampleTraceSelector,
} from "@/src/features/evals/v2/components/SampleTracePanel";
import { SetupStep } from "@/src/features/evals/v2/components/SetupStep";
import {
  buildScoreOutputDefinition,
  ScoreOutputSection,
  toScoreOutputFormState,
  type ScoreOutputFormState,
} from "@/src/features/evals/v2/components/ScoreOutputSection";
import { ScopePreviewTable } from "@/src/features/evals/v2/components/ScopePreviewTable";
import {
  TestRunButton,
  TestRunResult,
  useTestRunMutation,
  type TestRunPayload,
} from "@/src/features/evals/v2/components/TestRunSection";
import {
  VariableMappingContent,
  VariableMappingList,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
import { useSourceObject } from "@/src/features/evals/v2/lib/useSourceObject";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api, type RouterOutputs } from "@/src/utils/api";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  EvalTargetObject,
  extractValueFromObjectAsString,
  extractVariables,
  getIsCharOrUnderscore,
  variableMapping,
  type EvalTemplate,
  type ObservationVariableMapping,
} from "@langfuse/shared";

export type CatalogTemplate = RouterOutputs["evalsV2"]["catalog"][number];

export type EvaluatorTab = "llm" | "python" | "typescript";

type SaveStatus = "ACTIVE" | "INACTIVE";

const SCRATCH_PROMPT = `You are an expert evaluator. Judge the quality of the model response below.

Evaluation criteria:
- Describe what a good response looks like.
- Describe what should reduce the score.

Input:
{{input}}

Response:
{{output}}

Score the response on a scale from 0 to 1 and explain your reasoning.`;

const OUTPUT_HINTS = [
  "output",
  "generation",
  "answer",
  "completion",
  "response",
  "prediction",
];

const TEST_RUN_TRACE_ONLY_REASON =
  "Test runs only support the Traces data source in this prototype.";

function defaultColumnFor(templateVariable: string): string {
  const lower = templateVariable.toLowerCase();
  if (OUTPUT_HINTS.some((hint) => lower.includes(hint))) return "output";
  if (lower.includes("metadata")) return "metadata";
  return "input";
}

function toKebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function RuleSetupForm({
  projectId,
  sourceTemplate,
  initialEvaluatorType = "llm",
  onChangeEvaluator,
}: {
  projectId: string;
  sourceTemplate: CatalogTemplate | null;
  initialEvaluatorType?: "llm" | "code";
  onChangeEvaluator: () => void;
}) {
  const router = useRouter();
  const utils = api.useUtils();

  const [tab, setTab] = useState<EvaluatorTab>(
    initialEvaluatorType === "code" ? "python" : "llm",
  );
  const isCodeMode = tab !== "llm";

  const [scoreName, setScoreName] = useState(
    sourceTemplate ? toKebabCase(sourceTemplate.name) : "",
  );
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState(
    sourceTemplate?.prompt ?? SCRATCH_PROMPT,
  );
  const [pythonCode, setPythonCode] = useState(DEFAULT_PYTHON_CODE_EVAL_SOURCE);
  const [typescriptCode, setTypescriptCode] = useState(
    DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
  );
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [scope, setScope] = useState<RunScopeFormState>(
    DEFAULT_RUN_SCOPE_STATE,
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  // Sample+test companion: docked rail on wide screens, sheet (opened from
  // the action bar) below. The test mutation lives here so the trigger
  // (header) and the result (footer) share state.
  const isWideScreen = useIsWideScreen();
  const [sampleSheetOpen, setSampleSheetOpen] = useState(false);
  const testRun = useTestRunMutation();

  // Which save button was clicked last — drives the pending spinner.
  const [pendingStatus, setPendingStatus] = useState<SaveStatus | null>(null);
  // Save was requested while an existing shared scope has local edits.
  const [scopeDialogStatus, setScopeDialogStatus] = useState<SaveStatus | null>(
    null,
  );

  // Variable mapping: per-variable field/path against the scope's data source.
  const [variableFields, setVariableFields] = useState<
    Record<string, VariableFieldState>
  >({});

  // Judge model (LLM mode): project default or custom via shared model params.
  const [judgeModelMode, setJudgeModelMode] =
    useState<JudgeModelMode>("default");
  const {
    modelParams,
    setModelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableModels,
    availableProviders,
    providerModelCombinations,
  } = useModelParams();
  useEvaluationModel(projectId, setModelParams);

  // Score output definition (LLM mode), prefilled from the source template.
  const [outputState, setOutputState] = useState<ScoreOutputFormState>(() =>
    toScoreOutputFormState(sourceTemplate?.outputDefinition ?? null),
  );

  const variables = useMemo(
    () =>
      Array.from(
        new Set(extractVariables(prompt).filter(getIsCharOrUnderscore)),
      ),
    [prompt],
  );

  const sampleTraces = api.traces.all.useQuery({
    projectId,
    searchQuery: null,
    searchType: [],
    filter: [],
    orderBy: { column: "timestamp", order: "DESC" },
    page: 0,
    limit: 20,
  });

  const traceOptions = useMemo(
    () =>
      (sampleTraces.data?.traces ?? []).map((t) => ({
        id: t.id,
        name: t.name ?? null,
        timestamp: t.timestamp,
      })),
    [sampleTraces.data],
  );

  useEffect(() => {
    if (!selectedTraceId && traceOptions.length > 0) {
      setSelectedTraceId(traceOptions[0].id);
    }
  }, [selectedTraceId, traceOptions]);

  // A trace picked from the scope preview may not be among the recent trace
  // options, so its timestamp is carried separately.
  const [pickedTraceTimestamp, setPickedTraceTimestamp] = useState<Date | null>(
    null,
  );

  const selectedTraceTimestamp =
    traceOptions.find((t) => t.id === selectedTraceId)?.timestamp ??
    pickedTraceTimestamp ??
    undefined;

  const handleSelectTraceFromPreview = (
    traceId: string,
    timestamp: Date | null,
  ) => {
    setSelectedTraceId(traceId);
    setPickedTraceTimestamp(timestamp);
  };

  const traceDetails = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      projectId,
      traceId: selectedTraceId ?? "",
      timestamp: selectedTraceTimestamp ?? null,
    },
    { enabled: Boolean(selectedTraceId) },
  );

  const previewData: PreviewData | null = useMemo(() => {
    if (!traceDetails.data || !selectedTraceId) return null;
    return {
      type: EvalTargetObject.TRACE,
      traceId: selectedTraceId,
      timestamp: traceDetails.data.timestamp ?? null,
      trace: traceDetails.data,
    };
  }, [traceDetails.data, selectedTraceId]);

  const targetObject = scope.targetObject;
  const isTraceTarget = targetObject === "trace";

  // The shared source object every variable maps against.
  const sourceObject = useSourceObject({
    projectId,
    previewData,
    targetObject,
  });

  const traceMapping: VariableMapping[] = useMemo(
    () =>
      variables.map((templateVariable) => {
        const fieldState = variableFields[templateVariable];
        return {
          templateVariable,
          langfuseObject: "trace" as VariableMapping["langfuseObject"],
          objectName: null,
          selectedColumnId:
            fieldState?.selectedColumnId ?? defaultColumnFor(templateVariable),
          jsonSelector: fieldState?.jsonSelector ?? null,
        };
      }),
    [variables, variableFields],
  );

  const strictTraceMapping = useMemo(() => {
    const parsed = z.array(variableMapping).safeParse(traceMapping);
    return parsed.success ? parsed.data : null;
  }, [traceMapping]);

  // Simplified mapping shape for observation/experiment targets.
  const simplifiedMapping: ObservationVariableMapping[] = useMemo(
    () =>
      variables.map((templateVariable) => {
        const fieldState = variableFields[templateVariable];
        return {
          templateVariable,
          selectedColumnId:
            fieldState?.selectedColumnId ?? defaultColumnFor(templateVariable),
          jsonSelector: fieldState?.jsonSelector ?? null,
        };
      }),
    [variables, variableFields],
  );

  const getVariableFieldState = (variable: string): VariableFieldState =>
    variableFields[variable] ?? {
      selectedColumnId: defaultColumnFor(variable),
      jsonSelector: null,
    };

  // Mapping health per variable against the sample data: connected when the
  // mapping extracts a non-empty value, broken (with the error message for
  // the hover tooltip) when it errors or comes up empty.
  const variableStatus = useMemo(() => {
    if (!sourceObject) return undefined;
    const status: Record<string, VariableMappingStatus> = {};
    for (const variable of variables) {
      const fieldState = variableFields[variable];
      const { value, error } = extractValueFromObjectAsString(
        sourceObject,
        fieldState?.selectedColumnId ?? defaultColumnFor(variable),
        fieldState?.jsonSelector ?? undefined,
      );
      status[variable] = error
        ? { status: "invalid", message: error.message }
        : !value
          ? {
              status: "invalid",
              message: "The mapping resolves to an empty value in the sample.",
            }
          : { status: "valid" };
    }
    return status;
  }, [sourceObject, variables, variableFields]);

  // Output definition payload: always for scratch, only when changed for
  // template-based evaluators (the server keeps the template's otherwise).
  const builtOutputDefinition = useMemo(
    () => buildScoreOutputDefinition(outputState),
    [outputState],
  );
  const initialBuiltOutputDefinition = useMemo(
    () =>
      buildScoreOutputDefinition(
        toScoreOutputFormState(sourceTemplate?.outputDefinition ?? null),
      ),
    [sourceTemplate],
  );
  const outputDefinitionRequired =
    !sourceTemplate ||
    JSON.stringify(builtOutputDefinition) !==
      JSON.stringify(initialBuiltOutputDefinition);

  const customModelIncomplete =
    judgeModelMode === "custom" &&
    (!modelParams.provider.value || !modelParams.model.value);

  const customModelPayload =
    judgeModelMode === "custom" && !customModelIncomplete
      ? {
          provider: modelParams.provider.value,
          model: modelParams.model.value,
          modelParams: getFinalModelParams(modelParams) as Record<
            string,
            unknown
          >,
        }
      : null;

  const runScopes = api.evalsV2.runScopes.useQuery({ projectId });

  const selectedExistingScope =
    scope.mode === "existing"
      ? runScopes.data?.find((s) => s.id === scope.runScopeId)
      : undefined;

  // Baseline compare against the persisted scope: did the user edit the
  // filter or sampling of a shared scope?
  const existingScopeEdited = selectedExistingScope
    ? JSON.stringify(scope.filterState) !==
        JSON.stringify(selectedExistingScope.filter) ||
      scope.sampling !== selectedExistingScope.sampling
    : false;

  const createRule = api.evalsV2.createRule.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: (_data, variables) => {
      utils.evalsV2.invalidate().catch(() => undefined);
      showSuccessToast(
        variables.status === "INACTIVE"
          ? {
              title: "Draft saved",
              description: `"${scoreName}" was saved as a draft — activate it when it should start scoring.`,
            }
          : {
              title: "Evaluator created",
              description: `"${scoreName}" will score matching data from now on.`,
            },
      );
      router.push(`/project/${projectId}/evals`).catch(() => undefined);
    },
  });

  const updateRunScope = api.evalsV2.updateRunScope.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  const isSaving = createRule.isPending || updateRunScope.isPending;

  /**
   * Validates the evaluator definition (everything except scope + status) and
   * returns the shared part of the createRule payload, or null after showing
   * an error toast.
   */
  const buildRuleFields = () => {
    if (!scoreName.trim()) {
      showErrorToast(
        "Missing evaluator name",
        "Give the evaluator a name — it is also used as the score name.",
      );
      return null;
    }

    if (isCodeMode) {
      const sourceCode = tab === "python" ? pythonCode : typescriptCode;
      if (!sourceCode.trim()) {
        showErrorToast("Missing source code", "Write the evaluator function.");
        return null;
      }
      return {
        projectId,
        scoreName: scoreName.trim(),
        description: description.trim() || null,
        evaluatorType: "CODE" as const,
        sourceCode,
        sourceCodeLanguage:
          tab === "python" ? ("PYTHON" as const) : ("TYPESCRIPT" as const),
        mapping: [],
      };
    }

    const mapping = isTraceTarget ? strictTraceMapping : simplifiedMapping;
    if (!mapping) {
      showErrorToast(
        "Incomplete variable mapping",
        "Map every {{variable}} before saving.",
      );
      return null;
    }
    if (customModelIncomplete) {
      showErrorToast(
        "Missing judge model",
        "Select a provider and model, or switch back to the project default.",
      );
      return null;
    }
    if (outputDefinitionRequired && !builtOutputDefinition) {
      showErrorToast(
        "Incomplete score output",
        "Fill in the score output descriptions (categorical scores need at least 2 categories).",
      );
      return null;
    }

    return {
      projectId,
      scoreName: scoreName.trim(),
      description: description.trim() || null,
      evaluatorType: "LLM_AS_JUDGE" as const,
      sourceTemplateId: sourceTemplate?.id ?? null,
      prompt,
      provider: customModelPayload?.provider,
      model: customModelPayload?.model,
      modelParams: customModelPayload?.modelParams,
      outputDefinition: outputDefinitionRequired
        ? builtOutputDefinition
        : undefined,
      mapping,
    };
  };

  /** New-scope payload with a client-side auto-generated unique name. */
  const buildNewScopePayload = () =>
    ({
      mode: "new",
      name: generateRunScopeName({
        filter: scope.filterState,
        targetObject: scope.targetObject,
        existingNames: (runScopes.data ?? []).map((s) => s.name),
      }),
      targetObject: scope.targetObject,
      filter: scope.filterState,
      sampling: scope.sampling,
      delay: 30_000,
    }) as const;

  const handleSave = (status: SaveStatus) => {
    const fields = buildRuleFields();
    if (!fields) return;
    setPendingStatus(status);

    if (scope.mode === "existing") {
      if (!selectedExistingScope) {
        showErrorToast("Missing run scope", "Select a run scope.");
        return;
      }
      if (existingScopeEdited) {
        // Shared scope has local edits: ask whether to propagate or fork.
        setScopeDialogStatus(status);
        return;
      }
      createRule.mutate({
        ...fields,
        scope: { mode: "existing", runScopeId: selectedExistingScope.id },
        status,
      });
      return;
    }

    createRule.mutate({ ...fields, scope: buildNewScopePayload(), status });
  };

  const handleUpdateScopeForAll = async () => {
    const status = scopeDialogStatus;
    const fields = buildRuleFields();
    if (!status || !fields || !selectedExistingScope) return;
    try {
      await updateRunScope.mutateAsync({
        projectId,
        runScopeId: selectedExistingScope.id,
        filter: scope.filterState,
        sampling: scope.sampling,
      });
    } catch {
      // onError already showed a toast; keep the dialog open for a retry.
      return;
    }
    setScopeDialogStatus(null);
    createRule.mutate({
      ...fields,
      scope: { mode: "existing", runScopeId: selectedExistingScope.id },
      status,
    });
  };

  const handleCreateNewScopeInstead = () => {
    const status = scopeDialogStatus;
    const fields = buildRuleFields();
    if (!status || !fields) return;
    setScopeDialogStatus(null);
    createRule.mutate({ ...fields, scope: buildNewScopePayload(), status });
  };

  const testDisabledReason = !isTraceTarget
    ? TEST_RUN_TRACE_ONLY_REASON
    : !selectedTraceId
      ? "Select a sample trace first."
      : !strictTraceMapping
        ? "Complete the variable mapping first."
        : customModelIncomplete
          ? "Select a custom judge model first."
          : null;

  const getTestPayload = (): TestRunPayload | null => {
    if (!selectedTraceId || !strictTraceMapping || !isTraceTarget) return null;
    return {
      projectId,
      prompt,
      sourceTemplateId: sourceTemplate?.id ?? null,
      provider: customModelPayload?.provider,
      model: customModelPayload?.model,
      modelParams: customModelPayload?.modelParams,
      outputDefinition: builtOutputDefinition ?? undefined,
      mapping: strictTraceMapping,
      traceId: selectedTraceId,
      traceTimestamp: selectedTraceTimestamp,
    };
  };

  const maintainer = sourceTemplate
    ? getMaintainer(sourceTemplate)
    : "Custom evaluator";

  const evaluatorTitle =
    sourceTemplate?.name ??
    (isCodeMode ? "Custom code evaluator" : "Custom LLM-as-a-judge");

  const scopeDialogScopeName = selectedExistingScope?.name ?? "";
  const scopeDialogEvaluatorCount =
    selectedExistingScope?._count.jobConfigurations ?? 0;
  const scopeDialogEvaluatorNames = (
    selectedExistingScope?.jobConfigurations ?? []
  )
    .map((jc) => jc.scoreName)
    .join(", ");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onChangeEvaluator}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Evaluators
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <span className="truncate text-sm font-medium" title={evaluatorTitle}>
            {evaluatorTitle}
          </span>
          <Badge variant="outline" className="shrink-0 text-xs font-normal">
            {maintainer}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="flex min-w-0 flex-col px-6 py-6">
            <SetupStep number={1} title="Choose where it runs">
              <RunScopeSection
                projectId={projectId}
                scope={scope}
                onChange={setScope}
              />
              {scope.targetObject !== "experiment" && (
                <div className="flex flex-col gap-2">
                  <Label>Preview</Label>
                  <p className="text-muted-foreground text-sm">
                    Sample over the last 24 hours that match these filters —
                    click a row to use its trace as the sample.
                  </p>
                  <ScopePreviewTable
                    projectId={projectId}
                    filterState={scope.filterState}
                    onSelectTrace={handleSelectTraceFromPreview}
                  />
                </div>
              )}
            </SetupStep>

            <SetupStep number={2} title="Define the evaluation">
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">
                  How scores are produced: an LLM judging with a prompt, or your
                  own Python or TypeScript code.
                </p>
                <Tabs
                  value={tab}
                  onValueChange={(value) => setTab(value as EvaluatorTab)}
                >
                  <TabsList>
                    <TabsTrigger value="llm">LLM-as-a-judge</TabsTrigger>
                    <TabsTrigger value="python">Python</TabsTrigger>
                    <TabsTrigger value="typescript">TypeScript</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {isCodeMode ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Code</p>
                  <p className="text-muted-foreground text-sm">
                    Computes the score for each matching item — it receives the
                    data and returns a value.
                  </p>
                  <CodeEvalTemplateFormBody
                    sourceCode={tab === "python" ? pythonCode : typescriptCode}
                    sourceCodeLanguage={
                      tab === "python" ? "PYTHON" : "TYPESCRIPT"
                    }
                    onSourceCodeChange={
                      tab === "python" ? setPythonCode : setTypescriptCode
                    }
                    editable
                    validationResult={null}
                  />
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Model</p>
                    <p className="text-muted-foreground text-sm">
                      The LLM that acts as the judge. The project default keeps
                      all evaluators on one model, managed in a single place.
                    </p>
                    <JudgeModelSection
                      projectId={projectId}
                      mode={judgeModelMode}
                      onModeChange={setJudgeModelMode}
                      modelParamsContext={{
                        modelParams,
                        availableModels,
                        availableProviders,
                        providerModelCombinations,
                        updateModelParamValue,
                        setModelParamEnabled,
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Prompt</p>
                    <p className="text-muted-foreground text-sm">
                      {
                        "The judge's instructions. {{variables}} pull in the data being evaluated — map them in the next step."
                      }
                    </p>
                    <PromptVariableEditor
                      value={prompt}
                      onChange={setPrompt}
                      variableStatus={variableStatus}
                      showPreviewToggle={isTraceTarget}
                      previewEnabled={previewEnabled && isTraceTarget}
                      onPreviewEnabledChange={setPreviewEnabled}
                      previewSlot={
                        previewData ? (
                          // Match the editor's typography (app font, text-sm)
                          // so toggling the preview doesn't change how the
                          // prompt reads.
                          <div className="[&_pre]:font-sans [&_pre]:text-sm">
                            <EvaluationPromptPreview
                              previewData={previewData}
                              projectId={projectId}
                              evalTemplate={
                                { prompt } as unknown as EvalTemplate
                              }
                              variableMapping={traceMapping}
                              isLoading={traceDetails.isLoading}
                              showControls={false}
                              className="min-h-0"
                            />
                          </div>
                        ) : (
                          <p className="text-muted-foreground rounded-md border p-3 text-sm">
                            Select a sample trace in the sample widget to
                            preview the interpolated prompt.
                          </p>
                        )
                      }
                      renderVariableContent={(variable) => (
                        <VariableMappingContent
                          variable={variable}
                          fieldState={getVariableFieldState(variable)}
                          sourceObject={sourceObject}
                          targetObject={targetObject}
                          onChange={(next) =>
                            setVariableFields((prev) => ({
                              ...prev,
                              [variable]: next,
                            }))
                          }
                        />
                      )}
                    />
                  </div>

                  <div>
                    <ScoreOutputSection
                      state={outputState}
                      onChange={setOutputState}
                    />
                  </div>
                </>
              )}
            </SetupStep>

            {!isCodeMode && (
              <SetupStep number={3} title="Map variables to data">
                <p className="text-muted-foreground text-sm">
                  Map the prompt&apos;s template variables to fields of the data
                  it runs on. Values are previewed against the selected sample.
                </p>
                <VariableMappingList
                  variables={variables}
                  getFieldState={getVariableFieldState}
                  sourceObject={sourceObject}
                  onChange={(variable, next) =>
                    setVariableFields((prev) => ({
                      ...prev,
                      [variable]: next,
                    }))
                  }
                />
              </SetupStep>
            )}

            <SetupStep
              number={isCodeMode ? 3 : 4}
              title="Describe the evaluator"
              isLast
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="score-name">Evaluator name</Label>
                <Input
                  id="score-name"
                  className="max-w-md"
                  placeholder="e.g. hallucination"
                  value={scoreName}
                  onChange={(e) => setScoreName(e.target.value)}
                />
                <p className="text-muted-foreground text-sm">
                  Also used as the score name on traces.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="evaluator-description">
                  Description (optional)
                </Label>
                <p className="text-muted-foreground text-sm">
                  Helps your team understand what this evaluator checks.
                </p>
                <Input
                  id="evaluator-description"
                  placeholder="What does this evaluator score?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </SetupStep>
          </div>
        </div>

        {/* Sample + test companion: testing is a feedback loop for every
            step, so it docks as a full-height sidebar on wide screens and
            becomes a sheet (opened from the action bar) on smaller ones. */}
        <SampleCompanion
          title={
            targetObject === "event" ? "Sample observation" : "Sample trace"
          }
          headerControls={
            targetObject !== "experiment" ? (
              <SampleTraceSelector
                projectId={projectId}
                traces={traceOptions}
                selectedTraceId={selectedTraceId}
                onSelectTraceId={setSelectedTraceId}
              />
            ) : undefined
          }
          isWide={isWideScreen}
          sheetOpen={sampleSheetOpen}
          onSheetOpenChange={setSampleSheetOpen}
          headerActions={
            <TestRunButton
              testRun={testRun}
              getPayload={getTestPayload}
              disabledReason={testDisabledReason}
              codeMode={isCodeMode}
            />
          }
          footer={
            !isCodeMode && (testRun.data || testRun.error) ? (
              <TestRunResult testRun={testRun} codeMode={isCodeMode} />
            ) : undefined
          }
        >
          {targetObject === "experiment" ? (
            <p className="text-muted-foreground text-sm">
              Experiment previews aren&apos;t wired in this prototype.
            </p>
          ) : (
            <SampleTracePanel
              projectId={projectId}
              traces={traceOptions}
              isLoadingTraces={sampleTraces.isLoading}
              previewData={previewData}
              isLoadingPreview={traceDetails.isLoading}
              targetObject={targetObject}
            />
          )}
        </SampleCompanion>
      </div>

      {/* Fixed action bar (Datadog-style): always visible while the steps
          scroll. */}
      <div className="bg-background flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2">
        {isWideScreen === false && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mr-auto"
            onClick={() => setSampleSheetOpen(true)}
          >
            <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
            Sample &amp; test
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSaving}
          loading={isSaving && pendingStatus === "INACTIVE"}
          onClick={() => handleSave("INACTIVE")}
        >
          Save as draft
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isSaving}
          loading={isSaving && pendingStatus === "ACTIVE"}
          onClick={() => handleSave("ACTIVE")}
        >
          Save
        </Button>
      </div>

      <Dialog
        open={scopeDialogStatus !== null}
        onOpenChange={(open) => {
          if (!open) setScopeDialogStatus(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update shared run scope?</DialogTitle>
            <DialogDescription>
              {`"${scopeDialogScopeName}" is used by ${scopeDialogEvaluatorCount} evaluator(s)${scopeDialogEvaluatorNames ? `: ${scopeDialogEvaluatorNames}` : ""}. Apply your changes to all of them, or keep them unchanged and create a new scope for this evaluator.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => setScopeDialogStatus(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={handleCreateNewScopeInstead}
            >
              Create new scope
            </Button>
            <Button
              type="button"
              loading={isSaving}
              onClick={() => {
                handleUpdateScopeForAll().catch(() => undefined);
              }}
            >
              Update for all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
