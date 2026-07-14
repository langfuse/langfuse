import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { FlaskConical, Sparkles } from "lucide-react";
import { SiPython, SiTypescript } from "react-icons/si";

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
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { CodeEvalTemplateFormBody } from "@/src/features/evals/components/code-eval-template-form-body";
import {
  SampleCompanion,
  useIsWideScreen,
} from "@/src/features/evals/v2/components/SampleCompanion";
import { useEvaluationModel } from "@/src/features/evals/hooks/useEvaluationModel";
import {
  DEFAULT_PYTHON_CODE_EVAL_SOURCE,
  DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";
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
import { type EventsTableRow } from "@/src/features/events/components/EventsTable";
import {
  SampleObservationPanel,
  SampleObservationSelector,
  type SampleObservationOption,
  type VariableMarker,
} from "@/src/features/evals/v2/components/SampleObservationPanel";
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
import { SamplePickPanel } from "@/src/features/evals/v2/components/SamplePickPanel";
import { VariableManifest } from "@/src/features/evals/v2/components/VariableManifest";
import {
  MAPPABLE_COLUMNS,
  VariableMappingContent,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
import { useScopeMatchCount } from "@/src/features/evals/v2/lib/useScopeMatchCount";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api, type RouterOutputs } from "@/src/utils/api";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  extractValueFromObjectAsString,
  extractVariables,
  getIsCharOrUnderscore,
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

const TEST_RUN_OBSERVATIONS_ONLY_REASON =
  "Test runs only support the Observations data source in this prototype.";

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
}: {
  projectId: string;
  sourceTemplate: CatalogTemplate | null;
  initialEvaluatorType?: "llm" | "code";
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
  const [selectedObservationId, setSelectedObservationId] = useState<
    string | null
  >(null);

  // Sample+test companion: docked rail on wide screens, sheet (opened from
  // the action bar) below. The test mutation lives here so the trigger
  // (header) and the result (footer) share state.
  const isWideScreen = useIsWideScreen();
  const [sampleSheetOpen, setSampleSheetOpen] = useState(false);
  const [sampleRailOpen, setSampleRailOpen] = useState(true);
  const testRun = useTestRunMutation();

  // Which save button was clicked last — drives the pending spinner.
  const [pendingStatus, setPendingStatus] = useState<SaveStatus | null>(null);
  // Save was requested while an existing shared scope has local edits.
  const [scopeDialogStatus, setScopeDialogStatus] = useState<SaveStatus | null>(
    null,
  );

  // Portal target: the preview table renders its columns picker here, next to
  // the Preview label instead of inside its own bordered container.
  const [previewColumnsPickerEl, setPreviewColumnsPickerEl] =
    useState<HTMLDivElement | null>(null);

  // Variable mapping: per-variable field/path against the scope's data source.
  const [variableFields, setVariableFields] = useState<
    Record<string, VariableFieldState>
  >({});

  // Pick mode: while set, the sample companion turns into click targets that
  // map this variable to the clicked field/path.
  const [pickVariable, setPickVariable] = useState<string | null>(null);

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

  // Sample candidates come from the scope preview table itself (reported via
  // onRowsChange), so the sample is always drawn from the same filtered data
  // the preview shows — never from an unrelated recent-observations list.
  const [previewRows, setPreviewRows] = useState<
    SampleObservationOption[] | null
  >(null);
  const handlePreviewRowsChange = useCallback((rows: EventsTableRow[]) => {
    const seen = new Set<string>();
    const options: SampleObservationOption[] = [];
    for (const row of rows) {
      if (!row.traceId || seen.has(row.id)) continue;
      seen.add(row.id);
      options.push({
        id: row.id,
        traceId: row.traceId,
        name: row.name ?? null,
        startTime: row.startTime,
      });
    }
    setPreviewRows(options);
  }, []);

  const observationOptions = useMemo(() => previewRows ?? [], [previewRows]);

  // Global time filter (shared across views via the page-header picker):
  // bounds the scope preview, the sample candidates, and the match count.
  const { timeRange, setTimeRange } = useTableDateRange(projectId);
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  // Rough scope-wide match count for the sample pager ("2 of 100+") —
  // intentionally independent from the preview table's data flow.
  const scopeMatchCount = useScopeMatchCount({
    projectId,
    filterState: scope.filterState,
    timeRange: absoluteTimeRange,
    enabled: scope.targetObject !== "experiment",
  });

  // An observation picked from the scope preview may not be among the current
  // options (e.g. after a filter change), so it is carried separately and the
  // pick stays sticky.
  const [pickedObservation, setPickedObservation] =
    useState<SampleObservationOption | null>(null);

  // Auto-select the preview's newest observation, and re-sync when a filter
  // change drops the auto-picked one from the preview. Explicit row picks
  // survive.
  useEffect(() => {
    if (observationOptions.length === 0) return;
    const selectionInOptions = observationOptions.some(
      (o) => o.id === selectedObservationId,
    );
    if (
      !selectedObservationId ||
      (!selectionInOptions && pickedObservation === null)
    ) {
      setSelectedObservationId(observationOptions[0].id);
    }
  }, [selectedObservationId, observationOptions, pickedObservation]);

  const selectedObservation =
    observationOptions.find((o) => o.id === selectedObservationId) ??
    (pickedObservation?.id === selectedObservationId
      ? pickedObservation
      : null);

  const handleSelectObservationFromPreview = (row: EventsTableRow) => {
    if (!row.traceId) return;
    setSelectedObservationId(row.id);
    setPickedObservation({
      id: row.id,
      traceId: row.traceId,
      name: row.name ?? null,
      startTime: row.startTime,
    });
  };

  const observationDetails = api.evalsV2.sampleObservation.useQuery(
    {
      projectId,
      observationId: selectedObservation?.id ?? "",
      traceId: selectedObservation?.traceId ?? "",
      startTime: selectedObservation?.startTime ?? null,
    },
    { enabled: Boolean(selectedObservation) },
  );

  const targetObject = scope.targetObject;
  const isObservationTarget = targetObject === "event";

  // The shared source object every variable maps against: the sample
  // observation itself.
  const sourceObject = useMemo(
    () =>
      isObservationTarget && observationDetails.data
        ? (observationDetails.data as unknown as Record<string, unknown>)
        : null,
    [isObservationTarget, observationDetails.data],
  );

  const observationMapping: ObservationVariableMapping[] = useMemo(
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

  // Leave pick mode when its variable is removed from the prompt or the
  // target loses its sample (e.g. switching to experiments).
  useEffect(() => {
    if (
      pickVariable &&
      (!variables.includes(pickVariable) || targetObject === "experiment")
    ) {
      setPickVariable(null);
    }
  }, [pickVariable, variables, targetObject]);

  const startPickFromSample = (variable: string) => {
    setPickVariable(variable);
    // Make sure the companion is actually visible to pick from.
    if (isWideScreen) setSampleRailOpen(true);
    else setSampleSheetOpen(true);
  };

  const endPickFromSample = () => {
    setPickVariable(null);
    if (isWideScreen === false) setSampleSheetOpen(false);
  };

  const handlePickFromSample = (
    columnId: string,
    jsonSelector: string | null,
  ) => {
    if (pickVariable) {
      setVariableFields((prev) => ({
        ...prev,
        [pickVariable]: { selectedColumnId: columnId, jsonSelector },
      }));
    }
    endPickFromSample();
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

  // Display label of each variable's current binding ("Input", or
  // "Output · $.path" with a JSONPath) — shown inside the prompt pills.
  const variableMappingLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const variable of variables) {
      const fieldState = variableFields[variable];
      const columnId =
        fieldState?.selectedColumnId ?? defaultColumnFor(variable);
      const columnLabel =
        MAPPABLE_COLUMNS.find((column) => column.id === columnId)?.label ??
        columnId;
      labels[variable] = fieldState?.jsonSelector
        ? `${columnLabel} · ${fieldState.jsonSelector}`
        : columnLabel;
    }
    return labels;
  }, [variables, variableFields]);

  // Which variables pull from which sample field — drives the colored
  // {{variable}} chips in the sample companion (normal and pick mode).
  const variableMarkers = useMemo(() => {
    const markers: Record<string, VariableMarker[]> = {};
    variables.forEach((variable, index) => {
      const fieldState = variableFields[variable];
      const columnId =
        fieldState?.selectedColumnId ?? defaultColumnFor(variable);
      (markers[columnId] ??= []).push({
        variable,
        colorIndex: index,
        jsonSelector: fieldState?.jsonSelector ?? null,
      });
    });
    return markers;
  }, [variables, variableFields]);

  // Prompt with every mapped {{variable}} replaced by its value from the
  // sample observation — the client-side twin of the server's interpolation.
  const interpolatedPromptPreview = useMemo(() => {
    if (!sourceObject) return null;
    return prompt.replace(/{{\s*([\w.]+)\s*}}/g, (match, key: string) => {
      if (!variables.includes(key)) return match;
      const fieldState = variableFields[key];
      const { value, error } = extractValueFromObjectAsString(
        sourceObject,
        fieldState?.selectedColumnId ?? defaultColumnFor(key),
        fieldState?.jsonSelector ?? undefined,
      );
      return error ? match : (value ?? "");
    });
  }, [prompt, sourceObject, variables, variableFields]);

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
      mapping: observationMapping,
    };
  };

  /** New-scope payload; auto-generates a unique name unless the user set one. */
  const buildNewScopePayload = () =>
    ({
      mode: "new",
      name:
        scope.name?.trim() ||
        generateRunScopeName({
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

  const testDisabledReason = !isObservationTarget
    ? TEST_RUN_OBSERVATIONS_ONLY_REASON
    : !selectedObservation
      ? "Select a sample observation first."
      : customModelIncomplete
        ? "Select a custom judge model first."
        : null;

  const getTestPayload = (): TestRunPayload | null => {
    if (!selectedObservation || !isObservationTarget) return null;
    return {
      projectId,
      prompt,
      sourceTemplateId: sourceTemplate?.id ?? null,
      provider: customModelPayload?.provider,
      model: customModelPayload?.model,
      modelParams: customModelPayload?.modelParams,
      outputDefinition: builtOutputDefinition ?? undefined,
      mapping: observationMapping,
      observationId: selectedObservation.id,
      traceId: selectedObservation.traceId,
      observationStartTime: selectedObservation.startTime,
    };
  };

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
      {/* Global time filter in the page header — same picker as the list
          views; the preview, sample candidates, and match count respect it. */}
      <TableHeaderControls timeRange={timeRange} setTimeRange={setTimeRange} />
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
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex flex-col gap-2">
                      <Label>Matching observations</Label>
                      <p className="text-muted-foreground text-sm">
                        Sample from the selected time range that matches these
                        filters — click a row to use it as the sample.
                      </p>
                    </div>
                    {/* Target for the preview table's portaled columns picker */}
                    <div ref={setPreviewColumnsPickerEl} />
                  </div>
                  <ScopePreviewTable
                    projectId={projectId}
                    filterState={scope.filterState}
                    timeRange={absoluteTimeRange}
                    onSelectObservation={handleSelectObservationFromPreview}
                    onRowsChange={handlePreviewRowsChange}
                    columnsPickerContainer={previewColumnsPickerEl}
                  />
                </div>
              )}
            </SetupStep>

            <SetupStep
              number={2}
              title="Define the evaluation"
              defaultOpen={false}
            >
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
                    <TabsTrigger value="llm" className="gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      LLM-as-a-judge
                    </TabsTrigger>
                    <TabsTrigger value="python" className="gap-1.5">
                      <SiPython className="h-3.5 w-3.5" />
                      Python
                    </TabsTrigger>
                    <TabsTrigger value="typescript" className="gap-1.5">
                      <SiTypescript className="h-3.5 w-3.5" />
                      TypeScript
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {isCodeMode ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Code</p>
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
                    hideLanguageLabel
                    headerAction={
                      <p className="text-muted-foreground text-sm">
                        Computes the score for each matching item — it receives
                        the data and returns a value.
                      </p>
                    }
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
                        "The judge's instructions. {{variables}} pull in the data being evaluated."
                      }
                    </p>
                    <PromptVariableEditor
                      value={prompt}
                      onChange={setPrompt}
                      variableStatus={variableStatus}
                      variableMappings={variableMappingLabels}
                      showPreviewToggle={isObservationTarget}
                      previewEnabled={previewEnabled && isObservationTarget}
                      onPreviewEnabledChange={setPreviewEnabled}
                      previewSlot={
                        interpolatedPromptPreview !== null ? (
                          // Match the editor's typography (app font, text-sm)
                          // so toggling the preview doesn't change how the
                          // prompt reads.
                          <pre className="max-h-[60dvh] overflow-y-auto rounded-md border p-3 font-sans text-sm whitespace-pre-wrap">
                            {interpolatedPromptPreview}
                          </pre>
                        ) : (
                          <p className="text-muted-foreground rounded-md border p-3 text-sm">
                            Select a sample observation in the sample widget to
                            preview the interpolated prompt.
                          </p>
                        )
                      }
                      renderVariableContent={(variable, close) => (
                        <VariableMappingContent
                          variable={variable}
                          colorIndex={Math.max(variables.indexOf(variable), 0)}
                          fieldState={getVariableFieldState(variable)}
                          sourceObject={sourceObject}
                          onChange={(next) =>
                            setVariableFields((prev) => ({
                              ...prev,
                              [variable]: next,
                            }))
                          }
                          onPickFromSample={() => {
                            close();
                            startPickFromSample(variable);
                          }}
                        />
                      )}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Variables</p>
                    <p className="text-muted-foreground text-sm">
                      {
                        "What each {{variable}} pulls into the prompt. Click a variable in the prompt or a row here to pick its value from the sample data."
                      }
                    </p>
                    <VariableManifest
                      variables={variables}
                      getFieldState={getVariableFieldState}
                      variableStatus={variableStatus}
                      sourceObject={sourceObject}
                      onChange={(variable, next) =>
                        setVariableFields((prev) => ({
                          ...prev,
                          [variable]: next,
                        }))
                      }
                      onPickFromSample={startPickFromSample}
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

            <SetupStep number={3} title="Describe the evaluator" isLast>
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
                  Also used as the name of the score it creates.
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
            targetObject === "experiment" ? "Sample" : "Sample observation"
          }
          headerControls={
            targetObject !== "experiment" ? (
              <SampleObservationSelector
                projectId={projectId}
                observations={observationOptions}
                selectedObservationId={selectedObservationId}
                onSelectObservationId={setSelectedObservationId}
                totalMatches={scopeMatchCount.count}
              />
            ) : undefined
          }
          isWide={isWideScreen}
          sheetOpen={sampleSheetOpen}
          onSheetOpenChange={(open) => {
            setSampleSheetOpen(open);
            // Dismissing the sheet mid-pick abandons the pick.
            if (!open) setPickVariable(null);
          }}
          railOpen={sampleRailOpen}
          onRailOpenChange={(open) => {
            setSampleRailOpen(open);
            // Collapsing the rail mid-pick abandons the pick.
            if (!open) setPickVariable(null);
          }}
          footer={
            // Result above, button below: the button stays anchored to the
            // rail bottom and the output slides in above it instead of
            // pushing it around.
            <div className="flex flex-col gap-3">
              {!isCodeMode && (testRun.data || testRun.error) && (
                <TestRunResult testRun={testRun} codeMode={isCodeMode} />
              )}
              <TestRunButton
                testRun={testRun}
                getPayload={getTestPayload}
                disabledReason={testDisabledReason}
                codeMode={isCodeMode}
              />
            </div>
          }
        >
          {targetObject === "experiment" ? (
            <p className="text-muted-foreground text-sm">
              Experiment previews aren&apos;t wired in this prototype.
            </p>
          ) : pickVariable && sourceObject ? (
            <SamplePickPanel
              variable={pickVariable}
              colorIndex={Math.max(variables.indexOf(pickVariable), 0)}
              sourceObject={sourceObject}
              fieldState={getVariableFieldState(pickVariable)}
              variableMarkers={variableMarkers}
              onPick={handlePickFromSample}
              onCancel={endPickFromSample}
            />
          ) : (
            <SampleObservationPanel
              observations={observationOptions}
              isLoadingObservations={previewRows === null}
              observation={sourceObject}
              isLoadingObservation={observationDetails.isLoading}
              variableMarkers={!isCodeMode ? variableMarkers : undefined}
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
            <DialogTitle>Update shared filter?</DialogTitle>
            <DialogDescription>
              {`"${scopeDialogScopeName}" is used by ${scopeDialogEvaluatorCount} evaluator(s)${scopeDialogEvaluatorNames ? `: ${scopeDialogEvaluatorNames}` : ""}. Apply your changes to all of them, or keep them unchanged and create a new shared filter for this evaluator.`}
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
              Create new filter
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
