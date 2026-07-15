import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import { Sparkles, TriangleAlert } from "lucide-react";
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
import {
  CodeEvalFunctionContractHint,
  CodeEvalTemplateFormBody,
} from "@/src/features/evals/components/code-eval-template-form-body";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { detailPageListKeys } from "@/src/features/navigate-detail-pages/context";
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
import { SetupStep } from "@/src/features/evals/v2/components/SetupStep";
import {
  buildScoreOutputDefinition,
  ScoreOutputSection,
  toScoreOutputFormState,
  type ScoreOutputFormState,
} from "@/src/features/evals/v2/components/ScoreOutputSection";
import { ScopePreviewTable } from "@/src/features/evals/v2/components/ScopePreviewTable";
import {
  TestIdlePanel,
  TestResultPanel,
  TestRunButton,
  useCodeTestRunMutation,
  useTestRunMutation,
  type CodeTestRunPayload,
  type TestRunPayload,
} from "@/src/features/evals/v2/components/TestRunSection";
import { getCodeEvalVariableMapping } from "@/src/features/evals/utils/code-eval-template-utils";
import {
  MAPPABLE_COLUMNS,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
import { VariableMappingPanel } from "@/src/features/evals/v2/components/VariableMappingPanel";
import { formatMappingLabel } from "@/src/features/evals/v2/lib/jsonPathSegments";
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

/** A sample candidate from the step-1 preview table. */
type SampleObservationOption = {
  /** Observation id. */
  id: string;
  /** Parent trace — needed for the peek and the byId lookup. */
  traceId: string;
  name: string | null;
  startTime: Date;
};

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

  // Starts empty on creation (template or scratch) — naming is a deliberate
  // step, not a prefill; the placeholder suggests the template's name.
  const [scoreName, setScoreName] = useState("");
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

  // Test mutations live here so the triggers (panel hub, step 3) and the
  // result surfaces share their state.
  const testRun = useTestRunMutation();
  const codeTestRun = useCodeTestRunMutation();

  // The standard trace peek serves as the inspector for both the sample
  // trace and a test run's execution trace.
  const peekNavigationProps = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp"],
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
    },
  });
  const peekConfig = useMemo(
    () => ({
      itemType: "TRACE" as const,
      detailNavigationKey: detailPageListKeys.traces,
      ...peekNavigationProps,
    }),
    [peekNavigationProps],
  );

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
  // Variables present in the initial (curated) prompt get heuristic defaults;
  // variables the user adds later start unmapped until they pick a field.
  const [variableFields, setVariableFields] = useState<
    Record<string, VariableFieldState>
  >(() =>
    Object.fromEntries(
      Array.from(
        new Set(
          extractVariables(sourceTemplate?.prompt ?? SCRATCH_PROMPT).filter(
            getIsCharOrUnderscore,
          ),
        ),
      ).map((variable) => [
        variable,
        { selectedColumnId: defaultColumnFor(variable), jsonSelector: null },
      ]),
    ),
  );

  // The variable being edited in the mapping panel next to the prompt —
  // activated by clicking a {{variable}} pill or a manifest row.
  const [activeVariable, setActiveVariable] = useState<string | null>(null);
  // Panel shows the last test result instead of the mapper. Precedence:
  // active variable (pills always win) > test result > idle hub.
  const [testResultOpen, setTestResultOpen] = useState(false);

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
    // Selecting is also inspecting: open the standard trace peek for the
    // clicked row, like every other observations table.
    peekConfig.openPeek?.(row.traceId);
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

  // Save/test payload. The server contract requires a column per variable,
  // so unmapped variables fall back to the heuristic default there — the UI
  // (amber pills, panel callout) is what pushes users to map them first.
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
      selectedColumnId: null,
      jsonSelector: null,
    };

  // Deactivate the mapping panel when its variable leaves the prompt — but
  // follow renames: typing over a freshly inserted variable's name removes
  // the old name and adds a new one in the same keystroke.
  const previousVariablesRef = useRef<string[]>(variables);
  useEffect(() => {
    const previous = previousVariablesRef.current;
    previousVariablesRef.current = variables;
    if (!activeVariable || variables.includes(activeVariable)) return;
    const added = variables.filter((v) => !previous.includes(v));
    setActiveVariable(added.length === 1 ? added[0] : null);
  }, [activeVariable, variables]);

  // Clicking away from the mapper returns the panel to its idle hub. A test
  // result deliberately survives click-away — only its back button or
  // activating a variable dismisses it. Clicks inside the panel keep it
  // open; so do clicks in overlays (select menus etc.), which portal
  // outside the app root.
  useEffect(() => {
    if (!activeVariable) return;
    const handler = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const appRoot = document.getElementById("__next");
      if (appRoot && !appRoot.contains(target)) return;
      if (target.closest("[data-variable-mapping-panel]")) return;
      setActiveVariable(null);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [activeVariable]);

  // Trash action in the mapping panel: removes every {{variable}} occurrence
  // from the prompt (the variable then leaves the panel via the effect above).
  const deleteVariable = (variable: string) => {
    const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    setPrompt(prompt.replace(new RegExp(`{{\\s*${escaped}\\s*}}`, "g"), ""));
    setVariableFields((prev) => {
      const next = { ...prev };
      delete next[variable];
      return next;
    });
  };

  // Mapping health per variable against the sample data: connected when the
  // mapping extracts a non-empty value, broken (with the error message for
  // the hover tooltip) when it errors or comes up empty. Unmapped variables
  // are always flagged, sample or not.
  const variableStatus = useMemo(() => {
    const status: Record<string, VariableMappingStatus> = {};
    for (const variable of variables) {
      const fieldState = variableFields[variable];
      if (!fieldState?.selectedColumnId) {
        status[variable] = {
          status: "invalid",
          message:
            "Not mapped yet — click to choose the data this variable pulls in.",
        };
        continue;
      }
      if (!sourceObject) continue;
      const { value, error } = extractValueFromObjectAsString(
        sourceObject,
        fieldState.selectedColumnId,
        fieldState.jsonSelector ?? undefined,
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

  // Display label of each variable's current binding ("Input", or the
  // collapsed "Output › … › name" with a JSONPath) — shown inside the pills.
  // Unmapped variables carry the call to action instead.
  const variableMappingLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const variable of variables) {
      const fieldState = variableFields[variable];
      const columnId = fieldState?.selectedColumnId;
      if (!columnId) {
        labels[variable] = "map data";
        continue;
      }
      const columnLabel =
        MAPPABLE_COLUMNS.find((column) => column.id === columnId)?.label ??
        columnId;
      labels[variable] = formatMappingLabel(
        columnLabel,
        fieldState?.jsonSelector ?? null,
      );
    }
    return labels;
  }, [variables, variableFields]);

  // Idle-panel overview: every variable with its mapping label, unmapped
  // first so the outstanding work leads.
  const variableOverview = useMemo(
    () =>
      variables
        .map((variable) => ({
          variable,
          label: variableMappingLabels[variable] ?? "map data",
          unmapped: !variableFields[variable]?.selectedColumnId,
        }))
        .sort((a, b) => Number(b.unmapped) - Number(a.unmapped)),
    [variables, variableMappingLabels, variableFields],
  );

  // Prompt with every mapped {{variable}} replaced by its value from the
  // sample observation — the client-side twin of the server's interpolation.
  // Rendered as nodes so the injected values read as highlights, not as
  // indistinguishable prompt text.
  const interpolatedPromptPreview = useMemo(() => {
    if (!sourceObject) return null;
    const parts: ReactNode[] = [];
    const regex = /{{\s*([\w.]+)\s*}}/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(prompt)) !== null) {
      parts.push(prompt.slice(cursor, match.index));
      const key = match[1];
      const fieldState = variableFields[key];
      const { value, error } =
        variables.includes(key) && fieldState?.selectedColumnId
          ? extractValueFromObjectAsString(
              sourceObject,
              fieldState.selectedColumnId,
              fieldState.jsonSelector ?? undefined,
            )
          : { value: null, error: new Error("unmapped") };
      parts.push(
        error ? (
          match[0]
        ) : (
          <span
            key={`${key}-${match.index}`}
            className="bg-primary-accent/10 rounded px-0.5"
            title={`{{${key}}}`}
          >
            {value ?? ""}
          </span>
        ),
      );
      cursor = match.index + match[0].length;
    }
    parts.push(prompt.slice(cursor));
    return parts;
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

  const unmappedVariables = variableOverview.filter((item) => item.unmapped);
  const testDisabledReason = !isObservationTarget
    ? TEST_RUN_OBSERVATIONS_ONLY_REASON
    : !selectedObservation
      ? "Select a sample observation first."
      : unmappedVariables.length > 0
        ? "Map all {{variables}} in step 2 first."
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

  // Code evaluators test the draft source directly; their variables are the
  // fixed code-eval set, not prompt {{variables}}.
  const activeSourceCode = tab === "python" ? pythonCode : typescriptCode;
  const codeTestDisabledReason = !isObservationTarget
    ? TEST_RUN_OBSERVATIONS_ONLY_REASON
    : !selectedObservation
      ? "Select a sample observation first."
      : !activeSourceCode.trim()
        ? "Write the evaluator code first."
        : null;

  const getCodeTestPayload = (): CodeTestRunPayload | null => {
    if (!selectedObservation || !isObservationTarget) return null;
    if (!activeSourceCode.trim()) return null;
    return {
      projectId,
      sourceCode: activeSourceCode,
      sourceCodeLanguage: tab === "python" ? "PYTHON" : "TYPESCRIPT",
      scoreName: scoreName.trim() || "draft-evaluator",
      mapping: getCodeEvalVariableMapping(),
      observationId: selectedObservation.id,
      traceId: selectedObservation.traceId,
      observationStartTime: selectedObservation.startTime,
    };
  };

  // The Test step drives whichever mutation matches the evaluator type.
  const activeTestIsPending = isCodeMode
    ? codeTestRun.isPending
    : testRun.isPending;
  const activeTestDisabledReason = isCodeMode
    ? codeTestDisabledReason
    : testDisabledReason;
  const hasTestResult = isCodeMode
    ? Boolean(codeTestRun.data || codeTestRun.error)
    : Boolean(testRun.data || testRun.error);
  const runActiveTest = () => {
    if (isCodeMode) {
      const payload = getCodeTestPayload();
      if (!payload) return;
      codeTestRun.mutate(payload);
    } else {
      const payload = getTestPayload();
      if (!payload) return;
      testRun.mutate(payload);
    }
    // The run's result takes over the panel next to the prompt/code.
    setActiveVariable(null);
    setTestResultOpen(true);
  };

  // Pills always win: activating a variable swaps the panel back to the
  // mapper; the last result stays reachable via the idle hub row.
  const activateVariable = (variable: string) => {
    setTestResultOpen(false);
    setActiveVariable(variable);
  };

  const openSampleTracePeek = () => {
    if (selectedObservation) peekConfig.openPeek?.(selectedObservation.traceId);
  };
  const openExecutionTracePeek = (executionTraceId: string) => {
    peekConfig.openPeek?.(executionTraceId);
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
                  <p className="text-muted-foreground text-sm">
                    Computes the score for each matching item — it receives the
                    data and returns a value.
                  </p>
                  {/* Same split as the LLM prompt: code left, test panel
                      right (code has no variables, so the panel is the test
                      hub / result). */}
                  <div className="grid items-stretch gap-3 md:grid-cols-2">
                    <CodeEvalTemplateFormBody
                      sourceCode={
                        tab === "python" ? pythonCode : typescriptCode
                      }
                      sourceCodeLanguage={
                        tab === "python" ? "PYTHON" : "TYPESCRIPT"
                      }
                      onSourceCodeChange={
                        tab === "python" ? setPythonCode : setTypescriptCode
                      }
                      editable
                      validationResult={null}
                      hideLanguageLabel
                      hideFunctionContractHint
                    />
                    {/* The editor is the height master: the panel fills its
                        cell absolutely so top and bottom always align, and
                        its own content scrolls internally. */}
                    <div className="relative min-h-[140px]">
                      {testResultOpen ? (
                        <TestResultPanel
                          className="absolute inset-0 rounded-md border"
                          isCodeMode
                          testRun={testRun}
                          codeTestRun={codeTestRun}
                          isPending={codeTestRun.isPending}
                          disabledReason={codeTestDisabledReason}
                          onRerun={runActiveTest}
                          onBack={() => setTestResultOpen(false)}
                          onOpenSampleTrace={openSampleTracePeek}
                          onOpenExecutionTrace={openExecutionTracePeek}
                        />
                      ) : (
                        <TestIdlePanel
                          className="absolute inset-0 rounded-md border"
                          isPending={codeTestRun.isPending}
                          disabledReason={codeTestDisabledReason}
                          onRun={runActiveTest}
                          lastResultLabel={
                            codeTestRun.data
                              ? codeTestRun.data.success
                                ? `Last test: ${String(codeTestRun.data.scores[0]?.value ?? "done")}`
                                : "Last test: failed"
                              : codeTestRun.error
                                ? "Last test: failed"
                                : null
                          }
                          onOpenLastResult={() => setTestResultOpen(true)}
                          sampleObservation={sourceObject}
                        />
                      )}
                    </div>
                  </div>
                  <CodeEvalFunctionContractHint />
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
                    {/* Split prompt section: editor left, mapping panel
                        right — clicking a pill activates its mapping. */}
                    <div className="grid items-stretch gap-3 md:grid-cols-2">
                      <PromptVariableEditor
                        value={prompt}
                        onChange={setPrompt}
                        variableStatus={variableStatus}
                        variableMappings={variableMappingLabels}
                        activeVariable={activeVariable}
                        onVariableClick={activateVariable}
                        showPreviewToggle={isObservationTarget}
                        previewEnabled={previewEnabled && isObservationTarget}
                        onPreviewEnabledChange={setPreviewEnabled}
                        previewSlot={
                          interpolatedPromptPreview !== null ? (
                            // A reading surface, not a disabled editor:
                            // muted document background, the injected sample
                            // values highlighted. Attached under the top
                            // toolbar (its top border draws the seam).
                            <pre className="bg-muted/30 max-h-[60dvh] overflow-y-auto rounded-b-md border p-3 font-sans text-sm whitespace-pre-wrap">
                              {interpolatedPromptPreview}
                            </pre>
                          ) : (
                            <p className="text-muted-foreground bg-muted/30 rounded-b-md border p-3 text-sm">
                              Select a sample observation in the sample widget
                              to preview the interpolated prompt.
                            </p>
                          )
                        }
                      />
                      {/* Editor = height master; the panel fills its cell
                          absolutely and scrolls internally. */}
                      <div className="relative min-h-[140px]">
                        {!activeVariable && testResultOpen ? (
                          <TestResultPanel
                            className="absolute inset-0 rounded-md border"
                            isCodeMode={false}
                            testRun={testRun}
                            codeTestRun={codeTestRun}
                            isPending={testRun.isPending}
                            disabledReason={testDisabledReason}
                            onRerun={runActiveTest}
                            onBack={() => setTestResultOpen(false)}
                            onOpenSampleTrace={openSampleTracePeek}
                            onOpenExecutionTrace={openExecutionTracePeek}
                          />
                        ) : (
                          <VariableMappingPanel
                            className="absolute inset-0 rounded-md border"
                            activeVariable={activeVariable}
                            fieldState={
                              activeVariable
                                ? getVariableFieldState(activeVariable)
                                : null
                            }
                            overview={variableOverview}
                            onSelectVariable={activateVariable}
                            sourceObject={sourceObject}
                            hasMatchingObservations={
                              observationOptions.length > 0
                            }
                            onChange={(next) => {
                              if (!activeVariable) return;
                              setVariableFields((prev) => ({
                                ...prev,
                                [activeVariable]: next,
                              }));
                            }}
                            onDelete={
                              activeVariable
                                ? () => deleteVariable(activeVariable)
                                : undefined
                            }
                            testAction={{
                              run: runActiveTest,
                              isPending: testRun.isPending,
                              disabledReason: testDisabledReason,
                              lastResultLabel: testRun.data
                                ? testRun.data.success
                                  ? `Last test: score ${String(testRun.data.score)}`
                                  : "Last test: failed"
                                : testRun.error
                                  ? "Last test: failed"
                                  : null,
                              onOpenLastResult: () => setTestResultOpen(true),
                            }}
                          />
                        )}
                      </div>
                    </div>
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

            <SetupStep
              number={3}
              title="Test it on the sample"
              defaultOpen={false}
            >
              {!isObservationTarget ? (
                <p className="text-muted-foreground text-sm">
                  {TEST_RUN_OBSERVATIONS_ONLY_REASON}
                </p>
              ) : (
                <div className="flex max-w-3xl flex-col rounded-md border">
                  {!hasTestResult ? (
                    // Placeholder: the result's future home, with the
                    // trigger living inside it.
                    <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center">
                      <TestRunButton
                        isPending={activeTestIsPending}
                        disabledReason={activeTestDisabledReason}
                        onRun={runActiveTest}
                      />
                      {selectedObservation ? (
                        <p className="text-muted-foreground text-xs">
                          Sample:{" "}
                          <button
                            type="button"
                            className="hover:text-foreground underline-offset-2 hover:underline"
                            title="Open the sample trace"
                            onClick={openSampleTracePeek}
                          >
                            {selectedObservation.name ?? selectedObservation.id}
                          </button>{" "}
                          — pick a different row in step 1 to change it.
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          No sample yet — pick a row in step 1.
                        </p>
                      )}
                      {!isCodeMode && unmappedVariables.length > 0 && (
                        <div className="text-dark-yellow mt-2 flex flex-col items-center gap-1 text-sm font-medium">
                          {unmappedVariables.map((item) => (
                            <button
                              key={item.variable}
                              type="button"
                              className="flex items-center gap-1.5 hover:underline"
                              title="Open in the variable mapper"
                              onClick={() => setActiveVariable(item.variable)}
                            >
                              <TriangleAlert className="h-4 w-4 shrink-0" />
                              {`{{${item.variable}}} isn't mapped yet — map it in step 2 before testing.`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <TestResultPanel
                      isCodeMode={isCodeMode}
                      testRun={testRun}
                      codeTestRun={codeTestRun}
                      isPending={activeTestIsPending}
                      disabledReason={activeTestDisabledReason}
                      onRerun={runActiveTest}
                      onOpenSampleTrace={openSampleTracePeek}
                      onOpenExecutionTrace={openExecutionTracePeek}
                    />
                  )}
                </div>
              )}
            </SetupStep>

            <SetupStep number={4} title="Describe the evaluator" isLast>
              <div className="flex flex-col gap-2">
                <Label htmlFor="score-name">Evaluator name</Label>
                <Input
                  id="score-name"
                  className="max-w-md"
                  placeholder={
                    sourceTemplate
                      ? `e.g. ${toKebabCase(sourceTemplate.name)}`
                      : "e.g. hallucination"
                  }
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
      </div>

      {/* Standard trace peek: opened from "Sample trace" / "Execution
          trace" in the test result surfaces. */}
      <TablePeekViewTraceDetail {...peekConfig} projectId={projectId} />

      {/* Fixed action bar (Datadog-style): always visible while the steps
          scroll. */}
      <div className="bg-background flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2">
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
