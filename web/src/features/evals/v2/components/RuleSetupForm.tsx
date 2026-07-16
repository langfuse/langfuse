import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import { InfoIcon, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { SiPython, SiTypescript } from "react-icons/si";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
// Animated tab variants: the active pill slides between options.
import {
  Tabs,
  AnimatedTabsList as TabsList,
  AnimatedTabsTrigger as TabsTrigger,
} from "@/src/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import useLocalStorage from "@/src/components/useLocalStorage";
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
  EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  EXAMPLE_FILTERS,
  mergeExampleFilters,
  ScopeFilterSearchBar,
} from "@/src/features/evals/v2/components/RunScopeSection";
import {
  SaveAndRunDialog,
  type SaveEvaluatorOptions,
} from "@/src/features/evals/v2/components/SaveAndRunDialog";
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
  TestResultPanel,
  TestRunButton,
  useCodeTestRunMutation,
  useTestRunMutation,
  type CodeTestRunPayload,
  type TestRunPayload,
} from "@/src/features/evals/v2/components/TestRunSection";
import { CodeSampleContextDrawer } from "@/src/features/evals/v2/components/CodeSampleContextPreview";
import { getCodeEvalVariableMapping } from "@/src/features/evals/utils/code-eval-template-utils";
import {
  MAPPABLE_COLUMNS,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
import { VariableMappingList } from "@/src/features/evals/v2/components/VariableMappingList";
import { formatMappingLabel } from "@/src/features/evals/v2/lib/jsonPathSegments";
import { useScopeMatchCount } from "@/src/features/evals/v2/lib/useScopeMatchCount";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api, type RouterOutputs } from "@/src/utils/api";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  extractValueFromObjectAsString,
  extractVariables,
  getIsCharOrUnderscore,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";

export type CatalogTemplate = RouterOutputs["evalsV2"]["catalog"][number];

export type EvaluatorTab = "llm" | "python" | "typescript";

/** A sample candidate from the scope-preview table. */
type SampleObservationOption = {
  /** Observation id. */
  id: string;
  /** Parent trace — needed for the peek and the byId lookup. */
  traceId: string;
  name: string | null;
  startTime: Date;
};

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

// Scope filters are stored as JSONB, which can reorder nested object keys.
// Canonicalising lets a save reuse an identical scope without surfacing that
// implementation detail in the dialog.
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, node) =>
    node && typeof node === "object" && !Array.isArray(node)
      ? Object.fromEntries(
          Object.entries(node as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : node,
  );
}

/** A section label with its helper copy tucked into a hover tooltip instead
    of a permanent paragraph — keeps the label row compact. */
function LabelWithTooltip({
  htmlFor,
  tooltip,
  children,
}: {
  htmlFor?: string;
  tooltip: ReactNode;
  children: ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
      {children}
      <Tooltip>
        <TooltipTrigger asChild>
          <InfoIcon className="text-muted-foreground h-3.5 w-3.5 cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </Label>
  );
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
    initialEvaluatorType === "code"
      ? sourceTemplate?.sourceCodeLanguage === "TYPESCRIPT"
        ? "typescript"
        : "python"
      : "llm",
  );
  const isCodeMode = tab !== "llm";

  // Examples seed an editable evaluator name; scratch creation remains empty.
  const [scoreName, setScoreName] = useState(() =>
    sourceTemplate ? toKebabCase(sourceTemplate.name) : "",
  );
  const [description, setDescription] = useState("");
  // The description field starts hidden behind an "+ Add description"
  // affordance; a non-empty value always shows it (covers prefill paths).
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [prompt, setPrompt] = useState(
    sourceTemplate?.prompt ?? SCRATCH_PROMPT,
  );
  // A custom code example lands with its source loaded.
  const [pythonCode, setPythonCode] = useState(
    sourceTemplate?.type === "CODE" &&
      sourceTemplate.sourceCodeLanguage === "PYTHON" &&
      sourceTemplate.sourceCode
      ? sourceTemplate.sourceCode
      : DEFAULT_PYTHON_CODE_EVAL_SOURCE,
  );
  const [typescriptCode, setTypescriptCode] = useState(
    sourceTemplate?.type === "CODE" &&
      sourceTemplate.sourceCodeLanguage === "TYPESCRIPT" &&
      sourceTemplate.sourceCode
      ? sourceTemplate.sourceCode
      : DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
  );
  const [previewEnabled, setPreviewEnabled] = useState(false);

  // Adjustable split between the evaluator (left) and scope (right) panes,
  // persisted per browser.
  const [splitLayout, setSplitLayout] = useLocalStorage<
    Record<string, number> | undefined
  >("evalV2SetupSplitLayout", undefined);
  // Code-mode counterpart of the prompt's interpolated preview: the sample
  // drawer attached under the editor, expanded/collapsed via its own strip.
  const [codeSampleDrawerOpen, setCodeSampleDrawerOpen] = useState(false);

  // Scope draft. Evaluators always target observations; experiment runs are
  // selected by filtering observations with an experiment id.
  const [filterState, setFilterState] = useState<FilterState>(() => [
    ...EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  ]);
  // Sample rate: edited in the save dialog and persisted with the run scope.
  const [sampling, setSampling] = useState(1);

  const [selectedObservationId, setSelectedObservationId] = useState<
    string | null
  >(null);

  // Test mutations live here so the triggers (panel hub, result surface) and
  // the save dialog's cost estimate share their state.
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

  const [pendingSave, setPendingSave] = useState(false);
  // The save dialog controls enablement and optional backfill.
  const [saveRunDialogOpen, setSaveRunDialogOpen] = useState(false);

  // Portal target: the preview table renders its columns picker here, next to
  // the Preview label instead of inside its own bordered container.
  const [previewColumnsPickerEl, setPreviewColumnsPickerEl] =
    useState<HTMLDivElement | null>(null);

  // Variable mapping: per-variable field/path against the sample observation.
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

  // The variable whose mapping card is open in step 2 — activated by
  // clicking a {{variable}} pill in the prompt or the card's pencil.
  const [activeVariable, setActiveVariable] = useState<string | null>(null);

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

  const scopeMatchCount = useScopeMatchCount({
    projectId,
    filterState,
    timeRange: absoluteTimeRange,
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

  const pickObservation = (row: EventsTableRow) => {
    if (!row.traceId) return;
    setSelectedObservationId(row.id);
    setPickedObservation({
      id: row.id,
      traceId: row.traceId,
      name: row.name ?? null,
      startTime: row.startTime,
    });
  };

  const handleSelectObservationFromPreview = (row: EventsTableRow) => {
    if (!row.traceId) return;
    pickObservation(row);
    // A row click is also inspecting: open the standard trace peek for the
    // clicked row, like every other observations table. (The radio dot picks
    // without opening the peek.)
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

  // The shared source object every variable maps against: the sample
  // observation itself.
  const sourceObject = useMemo(
    () =>
      observationDetails.data
        ? (observationDetails.data as unknown as Record<string, unknown>)
        : null,
    [observationDetails.data],
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

  // Manifest for the mapping panel: every variable with its mapping label,
  // in prompt order (the panel shows all of them, mapped or not).
  const variableOverview = useMemo(
    () =>
      variables.map((variable) => ({
        variable,
        label: variableMappingLabels[variable] ?? "map data",
        unmapped: !variableFields[variable]?.selectedColumnId,
      })),
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

  // Only observation scopes can drive this observation-centric form.
  const reusableScopes = useMemo(
    () => (runScopes.data ?? []).filter((s) => s.targetObject === "event"),
    [runScopes.data],
  );

  const matchingScope = useMemo(
    () =>
      reusableScopes.find(
        (candidate) =>
          candidate.sampling === sampling &&
          canonicalJson(candidate.filter) === canonicalJson(filterState),
      ) ?? null,
    [filterState, reusableScopes, sampling],
  );

  // Selecting a shared scope from the search bar copies its whole config —
  // whether it stays "the same scope" is decided in the save dialog, which
  // matches by filter content.
  const selectSharedScope = (id: string) => {
    const s = reusableScopes.find((candidate) => candidate.id === id);
    if (!s) return;
    setFilterState(s.filter);
    setSampling(s.sampling);
  };

  // Detail: the names of the evaluators using the scope, "a, b and x more"
  // past two. The query returns the first 5 names; `_count` has the true total.
  const evaluatorNamesDetail = (s: {
    jobConfigurations: { scoreName: string }[];
    _count: { jobConfigurations: number };
  }): string => {
    const total = s._count.jobConfigurations;
    if (total === 0) return "no evaluators yet";
    const names = s.jobConfigurations.map((jc) => jc.scoreName);
    const shown = names.slice(0, 2).join(", ");
    const rest = total - Math.min(2, names.length);
    return rest > 0 ? `${shown} and ${rest} more` : shown;
  };

  const sharedFilterSection =
    reusableScopes.length > 0
      ? {
          title: "Shared filters",
          items: reusableScopes.map((s) => ({
            id: s.id,
            label: s.name,
            detail: evaluatorNamesDetail(s),
          })),
        }
      : undefined;

  const createRule = api.evalsV2.createRule.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: (_data, mutationInput) => {
      utils.evalsV2.invalidate().catch(() => undefined);
      showSuccessToast(
        mutationInput.status === "INACTIVE"
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

  const isSaving = createRule.isPending;

  /**
   * Validates the evaluator definition (everything except scope + status) and
   * returns the shared part of the createRule payload, or null after showing
   * an error toast.
   */
  const buildRuleFields = () => {
    if (!scoreName.trim()) {
      showErrorToast(
        "Missing evaluator name",
        "Give the evaluator a name — scores use the same name.",
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
        "Check the score output: categorical scores need at least 2 unique choices, and a numeric range needs min below max.",
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

  const handleSaveEvaluator = () => {
    const fields = buildRuleFields();
    if (!fields) return;
    setSaveRunDialogOpen(true);
  };

  const handleConfirmSaveEvaluator = (options: SaveEvaluatorOptions) => {
    const fields = buildRuleFields();
    if (!fields) return;
    setPendingSave(true);
    createRule.mutate({
      ...fields,
      scope: matchingScope
        ? { mode: "existing", runScopeId: matchingScope.id }
        : {
            mode: "new",
            name: `Evaluator scope ${new Date().toISOString()}`,
            targetObject: "event",
            filter: filterState,
            sampling,
            delay: 30_000,
          },
      runContinuously: options.enabled,
      backfill: options.backfill,
      status: options.enabled || options.backfill ? "ACTIVE" : "INACTIVE",
    });
  };

  const handleCancel = () => {
    router.push(`/project/${projectId}/evals`).catch(() => undefined);
  };

  const unmappedVariables = variableOverview.filter((item) => item.unmapped);
  const testDisabledReason = !selectedObservation
    ? "Pick a sample observation in step 1 first."
    : unmappedVariables.length > 0
      ? "Map all {{variables}} first."
      : customModelIncomplete
        ? "Select a custom judge model first."
        : null;

  const getTestPayload = (): TestRunPayload | null => {
    if (!selectedObservation) return null;
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
  const codeTestDisabledReason = !selectedObservation
    ? "Pick a sample observation in step 1 first."
    : !activeSourceCode.trim()
      ? "Write the evaluator code first."
      : null;

  const getCodeTestPayload = (): CodeTestRunPayload | null => {
    if (!selectedObservation) return null;
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
    // Close any open mapping popover — the result appears in the test step.
    setActiveVariable(null);
  };

  // The test step shows the result permanently once a run exists.
  const hasLlmTestResult = Boolean(testRun.data || testRun.error);
  const hasCodeTestResult = Boolean(codeTestRun.data || codeTestRun.error);

  // Per-evaluation cost from the last successful LLM test run — feeds the
  // save dialog's daily projection. (Code evals run without LLM cost.)
  const testRunCostUsd =
    !isCodeMode && testRun.data?.success
      ? (testRun.data.estimatedCostUsd ?? null)
      : null;

  // Activating a variable (inserting a new one, or a warning link) opens its
  // mapping selector in step 2.
  const activateVariable = (variable: string) => {
    setActiveVariable(variable);
  };

  // Clicking a {{variable}} token in the prompt reveals, not edits: scrolls
  // to the card and expands its value preview. The nonce makes repeated
  // clicks on the same token re-fire.
  const [revealSignal, setRevealSignal] = useState<{
    variable: string;
    nonce: number;
  } | null>(null);
  const revealVariable = (variable: string) => {
    setRevealSignal((prev) => ({ variable, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const openSampleTracePeek = () => {
    if (selectedObservation) peekConfig.openPeek?.(selectedObservation.traceId);
  };
  const openExecutionTracePeek = (executionTraceId: string) => {
    peekConfig.openPeek?.(executionTraceId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Global time filter in the page header — same picker as the list
          views; the preview, sample candidates, and match count respect it. */}
      <TableHeaderControls timeRange={timeRange} setTimeRange={setTimeRange} />
      {/* Adjustable split: the divider drags, and the layout persists per
          browser via localStorage. */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={splitLayout}
        onLayoutChanged={setSplitLayout}
      >
        {/* LEFT — where it runs: filter + sample → mapping → test → naming. */}
        <ResizablePanel
          id="scope"
          defaultSize="66.6667%"
          minSize="25%"
          className="min-h-0 min-w-0 overflow-y-auto"
        >
          <div className="flex min-w-0 flex-col px-6 py-6">
            <SetupStep number={1} title="Choose data to evaluate">
              <div className="flex flex-col gap-2">
                <Label>Filter observations</Label>
                <p className="text-muted-foreground text-sm">
                  Choose which observations this evaluator will run on, then
                  pick one as a test sample.
                </p>
                <ScopeFilterSearchBar
                  projectId={projectId}
                  filterState={filterState}
                  setFilterState={setFilterState}
                  savedQueries={sharedFilterSection}
                  onPickSavedQuery={selectSharedScope}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {EXAMPLE_FILTERS.map((example) => (
                    <Button
                      key={example.label}
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setFilterState(
                          mergeExampleFilters(filterState, example.filters),
                        )
                      }
                    >
                      <example.icon className="mr-1.5 h-3.5 w-3.5" />
                      {example.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <LabelWithTooltip tooltip="The dot picks the sample row the mapping and test run against; clicking a row also opens it.">
                    Matching observations
                    {scopeMatchCount.count !== null && (
                      <span className="text-muted-foreground font-normal">
                        {`(${compactNumberFormatter(scopeMatchCount.count)})`}
                      </span>
                    )}
                  </LabelWithTooltip>
                  {/* Target for the preview table's portaled columns picker */}
                  <div ref={setPreviewColumnsPickerEl} />
                </div>
                <ScopePreviewTable
                  projectId={projectId}
                  filterState={filterState}
                  timeRange={absoluteTimeRange}
                  onSelectObservation={handleSelectObservationFromPreview}
                  onPickObservation={pickObservation}
                  selectedObservationId={selectedObservationId}
                  onRowsChange={handlePreviewRowsChange}
                  columnsPickerContainer={previewColumnsPickerEl}
                />
              </div>
            </SetupStep>

            {!isCodeMode && (
              <SetupStep
                number={2}
                title="Map prompt variables"
                defaultOpen={false}
              >
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground text-sm">
                    {
                      "Each {{variable}} in the prompt pulls data from the sample picked in step 1."
                    }
                  </p>
                  <VariableMappingList
                    overview={variableOverview}
                    activeVariable={activeVariable}
                    onActiveVariableChange={setActiveVariable}
                    revealSignal={revealSignal}
                    getFieldState={getVariableFieldState}
                    onChangeField={(variable, next) =>
                      setVariableFields((prev) => ({
                        ...prev,
                        [variable]: next,
                      }))
                    }
                    onDeleteVariable={deleteVariable}
                    sourceObject={sourceObject}
                    hasMatchingObservations={observationOptions.length > 0}
                  />
                </div>
              </SetupStep>
            )}

            <SetupStep
              number={isCodeMode ? 2 : 3}
              title="Test the evaluator"
              defaultOpen={false}
            >
              <div className="flex flex-col rounded-md border">
                {!(isCodeMode ? hasCodeTestResult : hasLlmTestResult) ? (
                  // Placeholder: the result's future home, with the
                  // trigger living inside it.
                  <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center">
                    <TestRunButton
                      isPending={
                        isCodeMode ? codeTestRun.isPending : testRun.isPending
                      }
                      disabledReason={
                        isCodeMode ? codeTestDisabledReason : testDisabledReason
                      }
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
                            onClick={() => activateVariable(item.variable)}
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
                    isPending={
                      isCodeMode ? codeTestRun.isPending : testRun.isPending
                    }
                    disabledReason={
                      isCodeMode ? codeTestDisabledReason : testDisabledReason
                    }
                    onRerun={runActiveTest}
                    onOpenSampleTrace={openSampleTracePeek}
                    onOpenExecutionTrace={openExecutionTracePeek}
                  />
                )}
              </div>
            </SetupStep>

            <SetupStep
              number={isCodeMode ? 3 : 4}
              title="Name the evaluator"
              isLast
              defaultOpen={false}
            >
              <div className="flex flex-col gap-2">
                <LabelWithTooltip
                  htmlFor="score-name"
                  tooltip="This name is also used for scores created by the evaluator."
                >
                  Evaluator name
                </LabelWithTooltip>
                <Input
                  id="score-name"
                  className="max-w-md"
                  placeholder="e.g. hallucination"
                  value={scoreName}
                  onChange={(e) => setScoreName(e.target.value)}
                />
                {/* The description is demoted behind this affordance — it stays
                    revealed once opened, and a non-empty value (e.g. a future
                    prefill) always shows the field. */}
                {!(descriptionVisible || description !== "") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground -ml-2.5 w-fit"
                    onClick={() => setDescriptionVisible(true)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add description
                  </Button>
                )}
              </div>

              {(descriptionVisible || description !== "") && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="evaluator-description">
                    Description (optional)
                  </Label>
                  <Input
                    id="evaluator-description"
                    autoFocus={descriptionVisible}
                    placeholder="What does this evaluator score?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              )}
            </SetupStep>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT — everything that defines the evaluation. No stepper; this
            column is the "what", the left column is the "where". */}
        <ResizablePanel
          id="evaluator"
          defaultSize="33.3333%"
          minSize="25%"
          className="min-h-0 min-w-0 overflow-y-auto"
        >
          <div className="flex min-w-0 flex-col gap-6 px-6 py-6">
            <div className="flex flex-col gap-2">
              <div className="flex h-7 items-center">
                <LabelWithTooltip tooltip="How scores are produced: an LLM judging with a prompt, or your own Python or TypeScript code.">
                  Evaluator type
                </LabelWithTooltip>
              </div>
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
                <LabelWithTooltip tooltip="Computes the score for each matching item — it receives the data and returns a value. Test it against the sample in the left pane.">
                  Code
                </LabelWithTooltip>
                {/* Editor + attached sample drawer: one composite widget,
                    the drawer strip draws the seam. */}
                <div>
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
                    hideFunctionContractHint
                    editorClassName="rounded-b-none"
                  />
                  <CodeSampleContextDrawer
                    open={codeSampleDrawerOpen}
                    onOpenChange={setCodeSampleDrawerOpen}
                    sampleObservation={sourceObject}
                    sampleLabel={
                      selectedObservation
                        ? (selectedObservation.name ?? selectedObservation.id)
                        : null
                    }
                    language={tab === "python" ? "PYTHON" : "TYPESCRIPT"}
                  />
                </div>
                <CodeEvalFunctionContractHint />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <LabelWithTooltip tooltip="The judge's instructions, run on the model below. {{variables}} pull in the data being evaluated — map them in step 2 on the left.">
                    Prompt
                  </LabelWithTooltip>
                  {/* Experiment: the judge model lives with the prompt (its
                      instructions run on it) instead of as its own section. */}
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
                  <PromptVariableEditor
                    value={prompt}
                    onChange={setPrompt}
                    variableStatus={variableStatus}
                    variableMappings={variableMappingLabels}
                    activeVariable={activeVariable}
                    onVariableClick={revealVariable}
                    showPreviewToggle
                    previewEnabled={previewEnabled}
                    onPreviewEnabledChange={setPreviewEnabled}
                    previewDisabledReason={null}
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
                          Pick a sample observation in step 1 to preview the
                          interpolated prompt.
                        </p>
                      )
                    }
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
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Standard trace peek: opened from "Sample trace" / "Execution
          trace" in the test result surfaces. */}
      <TablePeekViewTraceDetail {...peekConfig} projectId={projectId} />

      {/* Fixed action bar: cancel abandons this setup; saving opens the
          evaluator's enablement and backfill choices. */}
      <div className="bg-background flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2">
        <Button
          type="button"
          variant="outline"
          disabled={isSaving}
          onClick={handleCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={isSaving}
          loading={isSaving && pendingSave}
          onClick={handleSaveEvaluator}
        >
          Save evaluator
        </Button>
      </div>

      <SaveAndRunDialog
        projectId={projectId}
        open={saveRunDialogOpen}
        onOpenChange={setSaveRunDialogOpen}
        filterState={filterState}
        sampling={sampling}
        onSamplingChange={setSampling}
        testRunCostUsd={testRunCostUsd}
        isSaving={isSaving}
        onConfirm={handleConfirmSaveEvaluator}
      />
    </div>
  );
}
