import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import {
  ChevronDown,
  Code2,
  InfoIcon,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { SiPython, SiTypescript } from "react-icons/si";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Slider } from "@/src/components/ui/slider";
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
  usePanelRef,
} from "@/src/components/ui/resizable";
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
  RuleFilterSearchBar,
} from "@/src/features/evals/v2/components/EvaluationRuleSection";
import { type EventsTableRow } from "@/src/features/events/components/EventsTable";
import {
  buildScoreOutputDefinition,
  ScoreOutputSection,
  toScoreOutputFormState,
  type ScoreOutputFormState,
} from "@/src/features/evals/v2/components/ScoreOutputSection";
import { EvaluationRulePreviewTable } from "@/src/features/evals/v2/components/EvaluationRulePreviewTable";
import {
  TestResultPanel,
  TestRunButton,
  useCodeTestRunMutation,
  useTestRunMutation,
  type CodeTestRunPayload,
  type TestRunPayload,
} from "@/src/features/evals/v2/components/TestRunSection";
import { CodeSampleContextDrawer } from "@/src/features/evals/v2/components/CodeSampleContextPreview";
import { CreateEvaluatorActivationDialog } from "@/src/features/evals/v2/components/CreateEvaluatorActivationDialog";
import { getCodeEvalVariableMapping } from "@/src/features/evals/utils/code-eval-template-utils";
import {
  MAPPABLE_COLUMNS,
  type VariableFieldState,
} from "@/src/features/evals/v2/components/VariableMappingPopover";
import { VariableMappingList } from "@/src/features/evals/v2/components/VariableMappingList";
import { SetupStep } from "@/src/features/evals/v2/components/SetupStep";
import { estimateEvaluatorCost } from "@/src/features/evals/v2/actions/estimateEvaluatorCost";
import { formatMappingLabel } from "@/src/features/evals/v2/lib/jsonPathSegments";
import { buildEvaluationRuleFilterSuggestionSection } from "@/src/features/evals/v2/lib/evaluationRuleFilterSuggestions";
import { removePromptVariable } from "@/src/features/evals/v2/lib/promptVariables";
import { useRuleMatchCount } from "@/src/features/evals/v2/lib/useRuleMatchCount";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api, type RouterOutputs } from "@/src/utils/api";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { cn } from "@/src/utils/tailwind";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  extractValueFromObjectAsString,
  extractVariables,
  getIsCharOrUnderscore,
  type FilterState,
  type ModelParams,
  type ObservationVariableMapping,
} from "@langfuse/shared";

export type CatalogTemplate = RouterOutputs["evalsV2"]["catalog"][number];

export type EvaluatorTab = "llm" | "python" | "typescript";

export type EvaluatorSetupRuleControls = {
  filterState: FilterState;
  setFilterState: (filterState: FilterState) => void;
  sampling: number;
  setSampling: (sampling: number) => void;
  applyRule: (rule: { filter: FilterState; sampling: number }) => void;
};

/** A sample candidate from the rule-preview table. */
type SampleObservationOption = {
  /** Observation id. */
  id: string;
  /** Parent trace — needed for the peek and the byId lookup. */
  traceId: string;
  name: string | null;
  startTime: Date;
};

function toSampleObservationOptions(
  rows: EventsTableRow[],
): SampleObservationOption[] {
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
  return options;
}

function reconcileSampleObservationOptions(
  current: SampleObservationOption[] | null,
  rows: EventsTableRow[],
) {
  const next = toSampleObservationOptions(rows);
  // EventsTable reports its rows after rendering. Preserve the state reference
  // when that report is unchanged so the parent does not trigger it again.
  const unchanged =
    current !== null &&
    current.length === next.length &&
    current.every(
      (option, index) =>
        option.id === next[index]?.id &&
        option.traceId === next[index]?.traceId &&
        option.name === next[index]?.name &&
        option.startTime.getTime() === next[index]?.startTime.getTime(),
    );
  return unchanged ? current : next;
}

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
      <InfoTooltip tooltip={tooltip} />
    </Label>
  );
}

function InfoTooltip({ tooltip }: { tooltip: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InfoIcon className="text-muted-foreground h-3.5 w-3.5 cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function EvaluatorSetupForm({
  projectId,
  sourceTemplate,
  initialEvaluatorType = "llm",
  scoreName,
  description,
  onScoreNameChange,
  onDescriptionChange,
  mode = "create",
  evaluatorId,
  initialMapping = [],
  initialFilterState,
  initialSampling = 1,
  attachedRuleIds = [],
  activeFilterSourceLabel,
  renderRuleControls,
  renderDataSourceControls,
  renderFilterActions,
  filterEditingDisabled = false,
  samplingEditingDisabled = false,
  ruleEditorExpanded = true,
  hasRuleChanges = false,
  onFiltersEdited,
  onBeforeSave,
  onSaved,
  onCancel,
}: {
  projectId: string;
  sourceTemplate: CatalogTemplate | null;
  initialEvaluatorType?: "llm" | "code";
  scoreName: string;
  description: string;
  onScoreNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  mode?: "create" | "edit";
  evaluatorId?: string;
  initialMapping?: ObservationVariableMapping[];
  initialFilterState?: FilterState;
  initialSampling?: number;
  attachedRuleIds?: string[];
  activeFilterSourceLabel?: string;
  renderRuleControls?: (controls: EvaluatorSetupRuleControls) => ReactNode;
  renderDataSourceControls?: (
    controls: EvaluatorSetupRuleControls,
  ) => ReactNode;
  renderFilterActions?: (controls: EvaluatorSetupRuleControls) => ReactNode;
  filterEditingDisabled?: boolean;
  samplingEditingDisabled?: boolean;
  ruleEditorExpanded?: boolean;
  hasRuleChanges?: boolean;
  onFiltersEdited?: (nextFilterState: FilterState) => void;
  onBeforeSave?: (controls: EvaluatorSetupRuleControls) => Promise<boolean>;
  onSaved?: () => void;
  onCancel?: () => void;
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
  const [sampleStepOpen, setSampleStepOpen] = useState(mode !== "edit");
  const [definitionStepOpen, setDefinitionStepOpen] = useState(mode === "edit");
  const [metadataStepOpen, setMetadataStepOpen] = useState(false);
  const isCodeMode = tab !== "llm";
  const [testPanelCollapsed, setTestPanelCollapsed] = useState(mode !== "edit");
  const testPanelRef = usePanelRef();
  const [isSaveWorkflowPending, setIsSaveWorkflowPending] = useState(false);
  const [activationDialogOpen, setActivationDialogOpen] = useState(false);
  const [activationTestRunCostUsd, setActivationTestRunCostUsd] = useState<
    number | null
  >(null);
  // Rule assignments are saved separately in the edit view. Keep the
  // evaluator-definition baseline here so only left-pane changes enable Save.
  const [initialScoreName] = useState(() => scoreName);
  const [initialDescription] = useState(() => description);

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

  // Code-mode counterpart of the prompt's interpolated preview: the sample
  // drawer attached under the editor, expanded/collapsed via its own strip.
  const [codeSampleDrawerOpen, setCodeSampleDrawerOpen] = useState(false);

  // Rule draft. Evaluators always rule observations; experiment runs are
  // selected by filtering observations with an experiment id.
  const [filterState, setFilterState] = useState<FilterState>(() =>
    initialFilterState
      ? [...initialFilterState]
      : [...EVALUATION_OBSERVATION_EXCLUSION_FILTERS],
  );
  // Sample rate follows a shared rule picked during setup and is persisted
  // with the setup filters after the user makes the pre-save activation choice.
  const [sampling, setSampling] = useState(initialSampling);
  const [samplingOpen, setSamplingOpen] = useState(false);

  const [selectedObservationId, setSelectedObservationId] = useState<
    string | null
  >(null);
  const sampleSelectionRef = useRef<HTMLDivElement>(null);
  const [sampleSelectionPrompted, setSampleSelectionPrompted] = useState(false);
  const sampleSelectionHighlightTimeoutRef = useRef<number | null>(null);

  // Test mutations live here so the trigger and result surface share state.
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

  // Portal rule: the preview table renders its columns picker here, next to
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
      ).map((variable) => {
        const existingMapping = initialMapping.find(
          (mapping) => mapping.templateVariable === variable,
        );
        return [
          variable,
          {
            selectedColumnId:
              existingMapping?.selectedColumnId ?? defaultColumnFor(variable),
            jsonSelector: existingMapping?.jsonSelector ?? null,
          },
        ];
      }),
    ),
  );

  // The variable whose mapping card is open — activated by
  // clicking a {{variable}} pill in the prompt or the card's pencil.
  const [activeVariable, setActiveVariable] = useState<string | null>(null);

  // Judge model (LLM mode): project default or custom via shared model params.
  const [judgeModelMode, setJudgeModelMode] = useState<JudgeModelMode>(
    sourceTemplate?.provider && sourceTemplate.model ? "custom" : "default",
  );
  const {
    modelParams,
    setModelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableModels,
    availableProviders,
    providerModelCombinations,
  } = useModelParams();
  const sourceTemplateModel = useMemo(
    () =>
      sourceTemplate?.provider && sourceTemplate.model
        ? {
            provider: sourceTemplate.provider,
            model: sourceTemplate.model,
            modelParams: (sourceTemplate.modelParams ?? {}) as ModelParams & {
              maxTemperature: number;
            },
          }
        : undefined,
    [sourceTemplate],
  );
  const { defaultModel: defaultEvaluationModel } = useEvaluationModel(
    projectId,
    setModelParams,
    sourceTemplateModel,
  );

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

  // Sample candidates come from the rule preview table itself (reported via
  // onRowsChange), so the sample is always drawn from the same filtered data
  // the preview shows — never from an unrelated recent-observations list.
  const [previewRows, setPreviewRows] = useState<
    SampleObservationOption[] | null
  >(null);
  const hasAutoSelectedEditSampleRef = useRef(false);
  const selectFirstSampleAfterFilterChangeRef = useRef(false);
  const handlePreviewRowsChange = useCallback(
    (rows: EventsTableRow[]) => {
      setPreviewRows((current) =>
        reconcileSampleObservationOptions(current, rows),
      );

      const firstObservation = toSampleObservationOptions(rows)[0];
      if (firstObservation) {
        if (selectFirstSampleAfterFilterChangeRef.current) {
          selectFirstSampleAfterFilterChangeRef.current = false;
          setSelectedObservationId(firstObservation.id);
        } else if (mode === "edit" && !hasAutoSelectedEditSampleRef.current) {
          hasAutoSelectedEditSampleRef.current = true;
          setSelectedObservationId(firstObservation.id);
        }
      } else {
        // The refreshed filter resolved with no selectable rows. Do not carry
        // the previous selection intent into a later, separate filter change.
        selectFirstSampleAfterFilterChangeRef.current = false;
      }
    },
    [mode],
  );

  const observationOptions = useMemo(() => previewRows ?? [], [previewRows]);

  // Global time filter (shared across views via the page-header picker):
  // bounds the rule preview, the sample candidates, and the match count.
  const { timeRange, setTimeRange } = useTableDateRange(projectId);
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  const ruleMatchCount = useRuleMatchCount({
    projectId,
    filterState,
    timeRange: absoluteTimeRange,
    enabled: ruleEditorExpanded,
  });

  // An explicitly picked observation may not be among the current options
  // (e.g. after a filter change), so it is carried separately and stays sticky.
  const [pickedObservation, setPickedObservation] =
    useState<SampleObservationOption | null>(null);

  const selectedObservation =
    observationOptions.find((o) => o.id === selectedObservationId) ??
    (pickedObservation?.id === selectedObservationId
      ? pickedObservation
      : null);
  const sampleSelectionWillAutoResolve =
    previewRows === null &&
    (selectFirstSampleAfterFilterChangeRef.current ||
      (mode === "edit" && !hasAutoSelectedEditSampleRef.current));

  const replaceFilterState = (nextFilterState: FilterState) => {
    // Preserve whether the user had opted into a sample, not the concrete row:
    // refreshed filters should use their own first match.
    selectFirstSampleAfterFilterChangeRef.current =
      selectFirstSampleAfterFilterChangeRef.current ||
      selectedObservationId !== null;
    // A filter edit before edit-mode's initial rows load counts as an explicit
    // choice to remain unselected.
    hasAutoSelectedEditSampleRef.current = true;
    setSelectedObservationId(null);
    setPickedObservation(null);
    setPreviewRows(null);
    setFilterState(nextFilterState);
  };

  const applyRule = (rule: { filter: FilterState; sampling: number }) => {
    replaceFilterState(rule.filter);
    setSampling(rule.sampling);
  };

  const pickObservation = (row: EventsTableRow) => {
    if (!row.traceId) return;
    selectFirstSampleAfterFilterChangeRef.current = false;
    if (sampleSelectionHighlightTimeoutRef.current !== null) {
      window.clearTimeout(sampleSelectionHighlightTimeoutRef.current);
      sampleSelectionHighlightTimeoutRef.current = null;
    }
    setSampleSelectionPrompted(false);
    setSelectedObservationId(row.id);
    setPickedObservation({
      id: row.id,
      traceId: row.traceId,
      name: row.name ?? null,
      startTime: row.startTime,
    });
    setDefinitionStepOpen(true);
    testPanelRef.current?.expand();
    setTestPanelCollapsed(false);
  };

  const focusSampleSelection = () => {
    setSampleStepOpen(true);
    setSampleSelectionPrompted(true);
    if (sampleSelectionHighlightTimeoutRef.current !== null) {
      window.clearTimeout(sampleSelectionHighlightTimeoutRef.current);
    }
    sampleSelectionHighlightTimeoutRef.current = window.setTimeout(() => {
      setSampleSelectionPrompted(false);
      sampleSelectionHighlightTimeoutRef.current = null;
    }, 2000);
    requestAnimationFrame(() => {
      sampleSelectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
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

  const initialObservationMapping = useMemo(
    () =>
      Array.from(
        new Set(
          extractVariables(sourceTemplate?.prompt ?? SCRATCH_PROMPT).filter(
            getIsCharOrUnderscore,
          ),
        ),
      ).map((templateVariable) => {
        const existingMapping = initialMapping.find(
          (mapping) => mapping.templateVariable === templateVariable,
        );
        return {
          templateVariable,
          selectedColumnId:
            existingMapping?.selectedColumnId ??
            defaultColumnFor(templateVariable),
          jsonSelector: existingMapping?.jsonSelector ?? null,
        };
      }),
    [initialMapping, sourceTemplate?.prompt],
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
    setPrompt(removePromptVariable(prompt, variable));
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

  const initialJudgeModelMode: JudgeModelMode =
    sourceTemplate?.provider && sourceTemplate.model ? "custom" : "default";
  // useEvaluationModel hydrates the custom model after the initial render.
  // Capture the hydrated model params as the edit baseline rather than
  // treating that initialization as a user change.
  const initialCustomModelParamsRef = useRef<Record<string, unknown> | null>(
    null,
  );
  if (
    initialJudgeModelMode === "custom" &&
    customModelPayload !== null &&
    initialCustomModelParamsRef.current === null
  ) {
    initialCustomModelParamsRef.current = customModelPayload.modelParams;
  }
  const hasModelChanges =
    judgeModelMode !== initialJudgeModelMode ||
    (judgeModelMode === "custom" &&
      customModelPayload !== null &&
      (customModelPayload.provider !== sourceTemplate?.provider ||
        customModelPayload.model !== sourceTemplate?.model ||
        JSON.stringify(customModelPayload.modelParams) !==
          JSON.stringify(initialCustomModelParamsRef.current ?? {})));

  const hasEvaluatorChanges =
    hasRuleChanges ||
    scoreName.trim() !== initialScoreName.trim() ||
    description.trim() !== initialDescription.trim() ||
    (isCodeMode
      ? (tab === "python" ? pythonCode : typescriptCode) !==
        (sourceTemplate?.sourceCode ??
          (tab === "python"
            ? DEFAULT_PYTHON_CODE_EVAL_SOURCE
            : DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE))
      : prompt !== (sourceTemplate?.prompt ?? SCRATCH_PROMPT) ||
        JSON.stringify(observationMapping) !==
          JSON.stringify(initialObservationMapping) ||
        outputDefinitionRequired ||
        hasModelChanges);

  const rules = api.evalsV2.rules.useQuery({ projectId });

  // Only observation rules can drive this observation-centric form.
  const reusableRules = useMemo(
    () => (rules.data ?? []).filter((rule) => rule.targetObject === "event"),
    [rules.data],
  );

  // Selecting a shared rule copies its config into setup. After saving, the
  // user explicitly chooses between these setup filters and an existing rule.
  const selectSharedRule = (id: string) => {
    const rule = reusableRules.find((candidate) => candidate.id === id);
    if (!rule) return;
    applyRule(rule);
    onFiltersEdited?.(rule.filter);
  };

  const updateDraftFilters = (nextFilterState: FilterState) => {
    replaceFilterState(nextFilterState);
    onFiltersEdited?.(nextFilterState);
  };

  const sharedFilterSection = buildEvaluationRuleFilterSuggestionSection({
    rules: reusableRules,
    attachedRuleIds,
  });

  const testRunCostUsd =
    !isCodeMode && testRun.data?.success
      ? (testRun.data.estimatedCostUsd ?? null)
      : null;

  const createEvaluator = api.evalsV2.createEvaluator.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const updateEvaluator = api.evalsV2.updateEvaluatorDefinition.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  const isSaving =
    createEvaluator.isPending ||
    updateEvaluator.isPending ||
    isSaveWorkflowPending;

  /**
   * Validates the evaluator definition (everything except rule + status) and
   * returns the shared part of the createEvaluator payload, or null after showing
   * an error toast.
   */
  const buildRuleFields = () => {
    if (!scoreName.trim()) {
      setMetadataStepOpen(true);
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
      provider:
        customModelPayload?.provider ?? (mode === "edit" ? null : undefined),
      model: customModelPayload?.model ?? (mode === "edit" ? null : undefined),
      modelParams:
        customModelPayload?.modelParams ?? (mode === "edit" ? null : undefined),
      outputDefinition: outputDefinitionRequired
        ? builtOutputDefinition
        : undefined,
      mapping: observationMapping,
    };
  };

  const createNewEvaluator = async (runContinuously: boolean) => {
    const fields = buildRuleFields();
    if (!fields) return;
    setIsSaveWorkflowPending(true);
    try {
      await createEvaluator.mutateAsync({
        ...fields,
        rule: runContinuously
          ? {
              mode: "new",
              name: `Evaluator rule ${new Date().toISOString()}`,
              targetObject: "event",
              filter: filterState,
              sampling,
              delay: 30_000,
            }
          : {
              mode: "none",
              targetObject: "event",
              filter: filterState,
              sampling,
            },
        runContinuously,
        backfill: null,
        status: runContinuously ? "ACTIVE" : "INACTIVE",
      });
      await Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]);
      setActivationDialogOpen(false);
      showSuccessToast({
        title: runContinuously ? "Evaluator is live" : "Evaluator saved",
        description: runContinuously
          ? `“${fields.scoreName}” will evaluate new matching observations.`
          : "The evaluator is inactive and can be started later.",
      });
      await router.push(`/project/${projectId}/evals/v2`);
    } catch {
      // Mutation callbacks surface create errors.
    } finally {
      setIsSaveWorkflowPending(false);
    }
  };

  const handleSaveEvaluator = async () => {
    const fields = buildRuleFields();
    if (!fields) return;
    if (mode === "create") {
      setIsSaveWorkflowPending(true);
      let estimatedCostUsd = testRunCostUsd;
      if (
        fields.evaluatorType === "LLM_AS_JUDGE" &&
        estimatedCostUsd === null
      ) {
        try {
          estimatedCostUsd = await estimateEvaluatorCost({
            testInput: {
              projectId,
              prompt: fields.prompt,
              sourceTemplateId: fields.sourceTemplateId,
              provider: fields.provider,
              model: fields.model,
              modelParams: fields.modelParams,
              outputDefinition: fields.outputDefinition,
              mapping: fields.mapping,
            },
            modelAvailable:
              judgeModelMode === "custom"
                ? customModelPayload !== null
                : Boolean(defaultEvaluationModel),
            getSample: async () => {
              const result = await utils.client.events.all.query({
                projectId,
                filter: filterState,
                searchQuery: null,
                searchType: [],
                orderBy: { column: "startTime", order: "DESC" },
                page: 1,
                limit: 1,
              });
              return result.observations[0] ?? null;
            },
            runTest: (input) => testRun.mutateAsync(input),
          });
        } catch {
          // Cost estimation is best-effort and must not block evaluator save.
        }
      }
      setActivationTestRunCostUsd(estimatedCostUsd);
      setActivationDialogOpen(true);
      setIsSaveWorkflowPending(false);
      return;
    }

    if (!evaluatorId) return;
    setIsSaveWorkflowPending(true);
    try {
      const shouldContinue = await onBeforeSave?.({
        filterState,
        setFilterState,
        sampling,
        setSampling,
        applyRule,
      });
      if (shouldContinue === false) return;

      await updateEvaluator.mutateAsync({
        projectId,
        evaluatorId,
        scoreName: fields.scoreName,
        description: fields.description,
        prompt: fields.evaluatorType === "LLM_AS_JUDGE" ? fields.prompt : null,
        sourceCode: fields.evaluatorType === "CODE" ? fields.sourceCode : null,
        sourceCodeLanguage:
          fields.evaluatorType === "CODE" ? fields.sourceCodeLanguage : null,
        provider:
          fields.evaluatorType === "LLM_AS_JUDGE" ? fields.provider : null,
        model: fields.evaluatorType === "LLM_AS_JUDGE" ? fields.model : null,
        modelParams:
          fields.evaluatorType === "LLM_AS_JUDGE" ? fields.modelParams : null,
        outputDefinition:
          fields.evaluatorType === "LLM_AS_JUDGE"
            ? fields.outputDefinition
            : null,
        mapping: fields.mapping,
      });
      await Promise.all([
        utils.evals.configById.invalidate({ projectId, id: evaluatorId }),
        utils.evalsV2.invalidate(),
      ]);
      showSuccessToast({
        title: "Evaluator updated",
        description: "The evaluator definition was saved.",
      });
      onSaved?.();
    } catch {
      // Mutation callbacks surface the actionable error.
    } finally {
      setIsSaveWorkflowPending(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    router.push(`/project/${projectId}/evals`).catch(() => undefined);
  };

  const unmappedVariables = variableOverview.filter((item) => item.unmapped);
  const testDisabledReason = !selectedObservation
    ? "Select a sample observation in step 1 first."
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
    ? "Select a sample observation in step 1 first."
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
    // Close any open mapping popover — the result appears in the test panel.
    setActiveVariable(null);
  };

  // The test panel shows the result permanently once a run exists.
  const hasLlmTestResult = Boolean(testRun.data || testRun.error);
  const hasCodeTestResult = Boolean(codeTestRun.data || codeTestRun.error);
  const hasActiveTestResult = isCodeMode ? hasCodeTestResult : hasLlmTestResult;

  // Activating a variable (inserting a new one, or a warning link) opens its
  // mapping selector.
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
      {renderRuleControls?.({
        filterState,
        setFilterState: updateDraftFilters,
        sampling,
        setSampling,
        applyRule,
      })}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          id="setup"
          minSize="55%"
          className="min-h-0 min-w-0 overflow-y-auto"
        >
          <div className="flex min-w-0 flex-col gap-3 p-6">
            <SetupStep
              number={1}
              title="Choose data to evaluate on"
              description="Filter observations to include only the spans you want to evaluate—extra matches can increase costs—then select one sample to preview the variable mapping."
              compactBottomSpacing
              open={sampleStepOpen}
              onOpenChange={setSampleStepOpen}
            >
              <div className="flex min-w-0 flex-col gap-4">
                {activeFilterSourceLabel ? (
                  <div className="bg-muted/40 flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="text-muted-foreground shrink-0">
                      Filters from
                    </span>
                    <span
                      className="truncate font-bold"
                      title={activeFilterSourceLabel}
                    >
                      {activeFilterSourceLabel}
                    </span>
                    {renderFilterActions?.({
                      filterState,
                      setFilterState: updateDraftFilters,
                      sampling,
                      setSampling,
                      applyRule,
                    })}
                  </div>
                ) : null}

                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Label className="shrink-0">Filter observations</Label>
                      {renderDataSourceControls?.({
                        filterState,
                        setFilterState: updateDraftFilters,
                        sampling,
                        setSampling,
                        applyRule,
                      })}
                      <InfoTooltip tooltip="Only matching observations are available as evaluator samples." />
                    </div>
                    <TableHeaderControls
                      timeRange={timeRange}
                      setTimeRange={setTimeRange}
                    />
                  </div>
                  <div
                    inert={filterEditingDisabled ? true : undefined}
                    aria-disabled={filterEditingDisabled}
                    className={cn(
                      "min-w-0",
                      filterEditingDisabled && "opacity-60",
                    )}
                  >
                    <RuleFilterSearchBar
                      projectId={projectId}
                      filterState={filterState}
                      setFilterState={updateDraftFilters}
                      savedQueries={sharedFilterSection}
                      onPickSavedQuery={selectSharedRule}
                    />
                  </div>
                  {!filterEditingDisabled ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {EXAMPLE_FILTERS.map((example) => (
                        <Button
                          key={example.label}
                          type="button"
                          variant="outline"
                          onClick={() =>
                            updateDraftFilters(
                              mergeExampleFilters(filterState, example.filters),
                            )
                          }
                        >
                          <example.icon className="mr-1.5 h-3.5 w-3.5" />
                          {example.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                  <div
                    ref={sampleSelectionRef}
                    className={cn(
                      "flex min-w-0 flex-col gap-2 rounded-md transition-shadow",
                      sampleSelectionPrompted &&
                        !selectedObservation &&
                        "ring-primary-accent ring-2 ring-offset-4",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <LabelWithTooltip tooltip="Pick one observation to preview mappings and test the evaluator against.">
                        Matching observations
                        {ruleMatchCount.count !== null && (
                          <span className="text-muted-foreground font-normal">
                            {`(${compactNumberFormatter(ruleMatchCount.count)})`}
                          </span>
                        )}
                      </LabelWithTooltip>
                      <div ref={setPreviewColumnsPickerEl} />
                    </div>
                    <EvaluationRulePreviewTable
                      projectId={projectId}
                      filterState={filterState}
                      timeRange={absoluteTimeRange}
                      onSelectObservation={handleSelectObservationFromPreview}
                      onPickObservation={pickObservation}
                      selectedObservationId={selectedObservationId}
                      onRowsChange={handlePreviewRowsChange}
                      columnsPickerContainer={previewColumnsPickerEl}
                      columnVisibilityStorageKeySuffix="evaluator-setup"
                    />
                  </div>

                  <button
                    type="button"
                    className="flex w-fit items-center text-sm"
                    aria-expanded={samplingOpen}
                    onClick={() => setSamplingOpen((open) => !open)}
                  >
                    <ChevronDown
                      className={cn(
                        "text-muted-foreground h-4 w-4 transition-transform",
                        !samplingOpen && "-rotate-90",
                      )}
                    />
                    Sampling
                    <span className="text-muted-foreground ml-1.5 font-normal">
                      {(sampling * 100).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </span>
                  </button>
                  {samplingOpen ? (
                    <div className="flex w-full max-w-md flex-col gap-2">
                      <Slider
                        min={0.0001}
                        max={1}
                        step={0.0001}
                        value={[sampling]}
                        disabled={samplingEditingDisabled}
                        onValueChange={(value) =>
                          setSampling(value[0] ?? sampling)
                        }
                        showInput
                        displayAsPercentage
                      />
                      <p className="text-muted-foreground text-xs">
                        {samplingEditingDisabled
                          ? "Sampling is configured on the selected evaluation rule."
                          : "Choose the share of matching observations to evaluate."}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </SetupStep>

            <SetupStep
              number={2}
              title="Define the evaluation"
              description="Configure how the evaluator turns the selected sample into a score."
              open={definitionStepOpen}
              onOpenChange={setDefinitionStepOpen}
              compactBottomSpacing
            >
              <div className="flex min-w-0 flex-col gap-4">
                {!selectedObservation && !sampleSelectionWillAutoResolve ? (
                  <Alert variant="info">
                    <InfoIcon className="h-4 w-4" />
                    <AlertTitle>Select a sample observation first</AlertTitle>
                    <AlertDescription className="flex flex-col items-start gap-2">
                      <p>
                        Choose one matching observation in step 1 to preview
                        variable mappings and test this evaluator.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={focusSampleSelection}
                      >
                        Choose sample
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-col gap-2">
                  <LabelWithTooltip tooltip="How scores are produced: an LLM judging with a prompt, or your own Python or TypeScript code.">
                    Evaluation
                  </LabelWithTooltip>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span>Run using</span>
                    <Tabs
                      value={isCodeMode ? "code" : "llm"}
                      onValueChange={(value) =>
                        setTab(
                          value === "llm"
                            ? "llm"
                            : tab === "llm"
                              ? "python"
                              : tab,
                        )
                      }
                    >
                      <TabsList className="bg-background [&>span[aria-hidden]]:bg-muted border">
                        <TabsTrigger
                          value="llm"
                          className="gap-1.5"
                          disabled={mode === "edit"}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          LLM-as-a-judge
                        </TabsTrigger>
                        <TabsTrigger
                          value="code"
                          className="gap-1.5"
                          disabled={mode === "edit"}
                        >
                          <Code2 className="h-3.5 w-3.5" />
                          Code evaluator
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {isCodeMode ? (
                      <>
                        <span>written in</span>
                        <Tabs
                          value={tab}
                          onValueChange={(value) =>
                            setTab(value as EvaluatorTab)
                          }
                        >
                          <TabsList className="bg-background [&>span[aria-hidden]]:bg-muted border">
                            <TabsTrigger
                              value="python"
                              className="gap-1.5"
                              disabled={mode === "edit"}
                            >
                              <SiPython className="h-3.5 w-3.5" />
                              Python
                            </TabsTrigger>
                            <TabsTrigger
                              value="typescript"
                              className="gap-1.5"
                              disabled={mode === "edit"}
                            >
                              <SiTypescript className="h-3.5 w-3.5" />
                              TypeScript
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </>
                    ) : (
                      <>
                        <span>with</span>
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
                      </>
                    )}
                  </div>
                </div>

                {isCodeMode ? (
                  <div className="flex flex-col gap-2">
                    <LabelWithTooltip tooltip="Computes the score for each matching item and can be tested against the selected sample.">
                      Code
                    </LabelWithTooltip>
                    <div className="flex flex-col gap-2">
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
                      <CodeSampleContextDrawer
                        open={codeSampleDrawerOpen}
                        onOpenChange={setCodeSampleDrawerOpen}
                        sampleObservation={sourceObject}
                        sampleLabel={
                          selectedObservation
                            ? (selectedObservation.name ??
                              selectedObservation.id)
                            : null
                        }
                        language={tab === "python" ? "PYTHON" : "TYPESCRIPT"}
                      />
                    </div>
                    <CodeEvalFunctionContractHint />
                  </div>
                ) : (
                  <>
                    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
                      <div className="flex min-w-0 flex-col gap-2">
                        <LabelWithTooltip tooltip="The judge's instructions. {{variables}} pull in the selected sample data.">
                          Prompt
                        </LabelWithTooltip>
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
                              <pre className="bg-muted/30 max-h-[60dvh] overflow-y-auto rounded-b-md border p-3 font-sans text-sm whitespace-pre-wrap">
                                {interpolatedPromptPreview}
                              </pre>
                            ) : (
                              <p className="text-muted-foreground bg-muted/30 rounded-b-md border p-3 text-sm">
                                Select a sample observation in step 1 to preview
                                the interpolated prompt.
                              </p>
                            )
                          }
                        />
                      </div>

                      <div className="flex min-w-0 flex-col gap-2">
                        <LabelWithTooltip tooltip="Connect each prompt variable to the data it should pull from the selected sample.">
                          Variable mapping
                        </LabelWithTooltip>
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
                          hasMatchingObservations={
                            observationOptions.length > 0
                          }
                          sampleLabel={
                            selectedObservation
                              ? (selectedObservation.name ??
                                selectedObservation.id)
                              : null
                          }
                          onOpenSample={openSampleTracePeek}
                        />
                      </div>
                    </div>

                    <ScoreOutputSection
                      state={outputState}
                      onChange={setOutputState}
                    />
                  </>
                )}
              </div>
            </SetupStep>

            <SetupStep
              number={3}
              title="Name the evaluator"
              description="Give the evaluator a recognizable name and an optional description."
              open={metadataStepOpen}
              onOpenChange={setMetadataStepOpen}
              isLast
            >
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="evaluator-name">Name</Label>
                  <Input
                    id="evaluator-name"
                    value={scoreName}
                    placeholder="e.g. response-quality"
                    onChange={(event) => onScoreNameChange(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Scores created by this evaluator use the same name.
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="evaluator-description">
                    Description (optional)
                  </Label>
                  <Input
                    id="evaluator-description"
                    value={description}
                    placeholder="What does this evaluator measure?"
                    onChange={(event) =>
                      onDescriptionChange(event.target.value)
                    }
                  />
                </div>
              </div>
            </SetupStep>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel
          id="test"
          panelRef={testPanelRef}
          defaultSize={mode === "edit" ? "30%" : "40px"}
          minSize="20%"
          collapsible
          collapsedSize="40px"
          onResize={() =>
            setTestPanelCollapsed(testPanelRef.current?.isCollapsed() ?? false)
          }
          className="min-h-0 min-w-0 overflow-y-auto"
        >
          {testPanelCollapsed ? (
            <div className="flex h-full items-start justify-center py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Expand test panel"
                title="Expand test panel"
                onClick={() => {
                  testPanelRef.current?.expand();
                  setTestPanelCollapsed(false);
                }}
              >
                <PanelRightOpen className="h-4 w-4" />
              </Button>
            </div>
          ) : ruleEditorExpanded ? (
            <section className="flex h-full min-h-0 min-w-0 flex-col">
              {!hasActiveTestResult ? (
                <header className="bg-muted/40 flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
                  <h2 className="text-base leading-7 font-bold">
                    Test evaluator
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Collapse test panel"
                    title="Collapse test panel"
                    onClick={() => {
                      testPanelRef.current?.collapse();
                      setTestPanelCollapsed(true);
                    }}
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </Button>
                </header>
              ) : null}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {!hasActiveTestResult ? (
                  <div className="flex min-h-[16rem] flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
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
                          className="hover:text-foreground break-all underline-offset-2 hover:underline"
                          title="Open the sample trace"
                          onClick={openSampleTracePeek}
                        >
                          {selectedObservation.name ?? selectedObservation.id}
                        </button>
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Select a sample observation in step 1 first.
                      </p>
                    )}
                    {!isCodeMode && unmappedVariables.length > 0 && (
                      <div className="text-dark-yellow mt-2 flex flex-col items-center gap-1 text-xs font-bold">
                        {unmappedVariables.map((item) => (
                          <button
                            key={item.variable}
                            type="button"
                            className="flex items-center gap-1.5 hover:underline"
                            title="Open in the variable mapper"
                            onClick={() => {
                              setDefinitionStepOpen(true);
                              activateVariable(item.variable);
                            }}
                          >
                            <TriangleAlert className="h-4 w-4 shrink-0" />
                            {`{{${item.variable}}} isn't mapped yet`}
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
                    headerActions={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Collapse test panel"
                        title="Collapse test panel"
                        onClick={() => {
                          testPanelRef.current?.collapse();
                          setTestPanelCollapsed(true);
                        }}
                      >
                        <PanelRightClose className="h-4 w-4" />
                      </Button>
                    }
                    className="flex-1"
                  />
                )}
              </div>
            </section>
          ) : null}
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Standard trace peek: opened from "Sample trace" / "Execution
          trace" in the test result surfaces. */}
      <TablePeekViewTraceDetail {...peekConfig} projectId={projectId} />

      <CreateEvaluatorActivationDialog
        projectId={projectId}
        setupFilter={filterState}
        setupSampling={sampling}
        testRunCostUsd={activationTestRunCostUsd}
        isCodeEvaluator={isCodeMode}
        open={activationDialogOpen}
        loading={isSaving}
        onOpenChange={setActivationDialogOpen}
        onSave={(runContinuously) => {
          createNewEvaluator(runContinuously).catch(() => undefined);
        }}
      />

      {/* Fixed action bar: cancel abandons setup; save persists the evaluator
          after the user decides whether it should start running. */}
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
          disabled={isSaving || (mode === "edit" && !hasEvaluatorChanges)}
          loading={isSaving}
          onClick={handleSaveEvaluator}
        >
          {mode === "edit" ? "Save changes" : "Save evaluator"}
        </Button>
      </div>
    </div>
  );
}
