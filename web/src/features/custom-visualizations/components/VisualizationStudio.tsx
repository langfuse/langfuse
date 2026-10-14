import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  Play,
  Save,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { FilterState } from "@langfuse/shared";

import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Badge } from "@/src/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { VisualizationFilterTokens } from "./VisualizationFilterTokens";
import { api, sendAsPostOption } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac";
import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
import { EvaluatorSampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorSampleObservationSelector/EvaluatorSampleObservationSelector";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { VisualizationRenderer } from "./VisualizationRenderer";
import {
  showErrorToast,
  showSuccessToast,
  showToast,
} from "@/src/features/notifications";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  compactContextPreview,
  selectDiverseObservations,
} from "../fns/visualizationGenerationContext";
import {
  TOOL_STARTER,
  TRACE_STARTER,
  VisualizationDefinitionSchema,
  type VisualizationDataEnvelope,
  type VisualizationDefinition,
} from "../types";

const DEFAULT_PROMPT =
  "Make the important sequence, tool activity, errors, and outputs easier to understand at a glance.";

type ComparisonMode = "compare" | "default" | "visualized";
type StudioSection = "applies" | "placement" | "visualization";

const contextFilters = (query: Record<string, unknown>): FilterState => {
  const source = typeof query.source === "string" ? query.source : "";
  const observationType =
    typeof query.observationType === "string" ? query.observationType : "";
  const observationName =
    typeof query.observationName === "string" ? query.observationName : "";
  if (source === "trace") {
    return [
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ];
  }
  return [
    ...(observationType
      ? ([
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: [observationType],
          },
        ] satisfies FilterState)
      : []),
    ...(observationName
      ? ([
          {
            column: "name",
            type: "string",
            operator: "=",
            value: observationName,
          },
        ] satisfies FilterState)
      : []),
  ];
};

const initialDefinition = (
  query: Record<string, unknown>,
): VisualizationDefinition => {
  if (query.source === "trace") return TRACE_STARTER;
  if (query.source !== "observation") {
    return {
      ...TOOL_STARTER,
      title: "Observation output view",
      summary:
        "A focused view of the selected observation output in its Session context.",
      match: { entity: "OBSERVATION", filters: [] },
      placement: {
        surface: "SESSION",
        slot: "OBSERVATION_OUTPUT",
        injection: "AFTER",
        anchor: {},
      },
      binding: { source: "OBSERVATION_OUTPUT" },
    };
  }
  const field = query.field === "input" ? "input" : "output";
  const observationName =
    typeof query.observationName === "string"
      ? query.observationName
      : undefined;
  const observationType =
    typeof query.observationType === "string"
      ? query.observationType
      : undefined;
  return {
    ...TOOL_STARTER,
    title: observationName
      ? `${observationName} ${field} view`
      : TOOL_STARTER.title,
    match: { entity: "OBSERVATION", filters: contextFilters(query) },
    placement: {
      surface: "SESSION",
      slot: field === "input" ? "OBSERVATION_INPUT" : "OBSERVATION_OUTPUT",
      injection: "AFTER",
      anchor: { observationName, observationType },
    },
    binding: {
      source: field === "input" ? "OBSERVATION_INPUT" : "OBSERVATION_OUTPUT",
    },
  };
};

const bindingLabel = (source: VisualizationDefinition["binding"]["source"]) => {
  if (source === "TRACE") return "Trace data view";
  if (source === "OBSERVATION_INPUT") return "Session · after input";
  if (source === "OBSERVATION_OUTPUT") return "Session · after output";
  return "Session";
};

const withMatchFilters = (
  definition: VisualizationDefinition,
  filters: FilterState,
): VisualizationDefinition => ({
  ...definition,
  match: { ...definition.match, filters },
  placement:
    definition.placement.surface === "SESSION"
      ? { ...definition.placement, anchor: {} }
      : definition.placement,
});

const matchRuleSummary = (filters: FilterState) => {
  if (filters.length === 0) return "All observations";
  return filters
    .map((filter) => {
      const value = Array.isArray(filter.value)
        ? filter.value.join(", ")
        : String(filter.value ?? "");
      if (
        filter.operator === "=" ||
        (filter.operator === "any of" &&
          Array.isArray(filter.value) &&
          filter.value.length === 1)
      ) {
        return `${filter.column}:${value}`;
      }
      return `${filter.column} ${filter.operator} ${value}`;
    })
    .join(" · ");
};

const customUiAnalyticsDimensions = (definition: VisualizationDefinition) => {
  const componentCount = Object.keys(definition.spec.elements).length;
  const visit = (key: string, seen: ReadonlySet<string>): number => {
    if (seen.has(key)) return 0;
    const element = definition.spec.elements[key];
    if (!element) return 0;
    const children = [
      ...element.children,
      ...Object.values(element.slots ?? {}).flat(),
    ];
    const nextSeen = new Set(seen).add(key);
    return 1 + Math.max(0, ...children.map((child) => visit(child, nextSeen)));
  };
  const depth = visit(definition.spec.root, new Set());
  const componentCountBucket = (() => {
    if (componentCount <= 10) return "1-10" as const;
    if (componentCount <= 50) return "11-50" as const;
    if (componentCount <= 100) return "51-100" as const;
    return "101-200" as const;
  })();
  const depthBucket = (() => {
    if (depth <= 3) return "1-3" as const;
    if (depth <= 6) return "4-6" as const;
    return "7-10" as const;
  })();
  return {
    placement:
      definition.placement.surface === "TRACE"
        ? ("trace" as const)
        : ("session" as const),
    catalogVersion: definition.catalogVersion,
    componentCountBucket,
    depthBucket,
  };
};

const describeShape = (value: unknown, depth = 0): unknown => {
  if (value === null) return "null";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      depth < 2 &&
      trimmed.length <= 100_000 &&
      ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]")))
    ) {
      try {
        return {
          type: "json-string",
          decoded: describeShape(JSON.parse(trimmed), depth + 1),
        };
      } catch {
        // It resembles JSON but remains a normal string when decoding fails.
      }
    }
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      item:
        depth < 2 && value.length > 0
          ? describeShape(value[0], depth + 1)
          : undefined,
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      20,
    );
    return {
      type: "object",
      fields: Object.fromEntries(
        entries.map(([key, item]) => [
          key,
          depth < 2 ? describeShape(item, depth + 1) : typeof item,
        ]),
      ),
    };
  }
  return typeof value;
};

const renderPreviewValue = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

function TraceDataPreview({
  projectId,
  observation,
  trace,
  loading,
}: {
  projectId: string;
  observation: SampleObservation | null;
  trace:
    | {
        id: string;
        name?: string | null;
        input?: unknown;
        output?: unknown;
        metadata?: unknown;
        environment?: string;
      }
    | undefined;
  loading: boolean;
}) {
  if (!observation?.traceId) {
    return (
      <div className="text-muted-foreground flex min-h-[360px] items-center justify-center p-8 text-center text-sm">
        Choose an example to see its normal Langfuse view.
      </div>
    );
  }

  return (
    <div className="ph-no-capture min-h-[360px] overflow-auto">
      <IOPreview
        projectId={projectId}
        traceId={observation.traceId}
        environment={trace?.environment}
        input={trace?.input as never}
        output={trace?.output as never}
        metadata={trace?.metadata as never}
        isLoading={loading}
        currentView="pretty"
        showCorrections={false}
      />
    </div>
  );
}

function SessionContextPreview({
  observation,
  io,
}: {
  observation: SampleObservation | null;
  io: { input?: unknown; output?: unknown } | undefined;
}) {
  if (!observation) {
    return (
      <div className="text-muted-foreground flex min-h-[360px] items-center justify-center p-8 text-center text-sm">
        Choose an example to see its Session placement.
      </div>
    );
  }

  return (
    <div className="ph-no-capture min-h-[360px] overflow-auto p-4">
      <div className="text-muted-foreground mb-5 flex items-center gap-2 font-mono text-[10px]">
        <span className="bg-muted rounded-sm border px-1.5 py-0.5">
          session
        </span>
        <span className="truncate" title={observation.traceId ?? undefined}>
          trace · {observation.traceId}
        </span>
        <div className="min-w-6 flex-1 border-t border-dashed" />
      </div>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ItemBadge type={observation.type as LangfuseItemType} isSmall />
          <span
            className="truncate text-xs font-bold"
            title={observation.name ?? undefined}
          >
            {observation.name ?? observation.type}
          </span>
        </div>
        <div className="flex justify-end">
          <div className="bg-muted/60 max-w-[88%] rounded-2xl rounded-br-sm border px-3 py-2">
            <div className="text-muted-foreground mb-1 font-mono text-[9px] uppercase">
              Input
            </div>
            <pre className="max-h-32 overflow-auto text-xs break-words whitespace-pre-wrap">
              {renderPreviewValue(io?.input)}
            </pre>
          </div>
        </div>
        <div className="flex justify-start">
          <div className="bg-background max-w-[88%] rounded-2xl rounded-bl-sm border px-3 py-2">
            <div className="text-muted-foreground mb-1 font-mono text-[9px] uppercase">
              Output
            </div>
            <pre className="max-h-32 overflow-auto text-xs break-words whitespace-pre-wrap">
              {renderPreviewValue(io?.output)}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}

function SessionVisualizationPreview({
  observation,
  definition,
  data,
}: {
  observation: SampleObservation | null;
  definition: VisualizationDefinition;
  data: VisualizationDataEnvelope;
}) {
  if (!observation) {
    return (
      <div className="text-muted-foreground flex min-h-[360px] items-center justify-center p-8 text-center text-sm">
        Choose an example to render this draft.
      </div>
    );
  }
  const slot =
    definition.binding.source === "OBSERVATION_INPUT" ? "input" : "output";
  return (
    <div className="ph-no-capture min-h-[360px] p-4">
      <div className="text-muted-foreground mb-3 flex items-center gap-1.5 text-[10px]">
        <span>Session</span>
        <span aria-hidden="true">›</span>
        <span
          className="text-foreground truncate"
          title={observation.name ?? undefined}
        >
          {observation.name ?? observation.type}
        </span>
        <span aria-hidden="true">›</span>
        <span>after {slot}</span>
      </div>
      <div className="bg-muted/10 rounded-xl border border-dashed p-2">
        <VisualizationRenderer
          definition={definition}
          data={data}
          showDiagnostics
        />
      </div>
    </div>
  );
}

function TraceVisualizationPreview({
  definition,
  data,
}: {
  definition: VisualizationDefinition;
  data: VisualizationDataEnvelope;
}) {
  return (
    <div className="ph-no-capture min-h-[360px] overflow-auto">
      <VisualizationRenderer
        definition={definition}
        data={data}
        showDiagnostics
      />
    </div>
  );
}

type VisualizationStudioProps = { projectId: string } & (
  | { mode: "create" }
  | {
      mode: "edit";
      visualizationId: string;
      versionId: string;
      initialDefinition: VisualizationDefinition;
    }
);

export function VisualizationStudio(props: VisualizationStudioProps) {
  const { projectId } = props;
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const hasAdminAccess = useHasProjectAccess({
    projectId,
    scope: "project:update",
  });
  const routeContext = router.query as Record<string, unknown>;
  const editorInitialDefinition =
    props.mode === "edit"
      ? props.initialDefinition
      : initialDefinition(routeContext);
  const [browseFilters, setBrowseFilters] = useState<FilterState>(() =>
    props.mode === "edit"
      ? props.initialDefinition.match.filters
      : contextFilters(routeContext),
  );
  const [selectedObservation, setSelectedObservation] =
    useState<SampleObservation | null>(null);
  const [selectedVisualizationId, setSelectedVisualizationId] = useState(
    props.mode === "edit" ? props.visualizationId : "",
  );
  const [selectedVersionId, setSelectedVersionId] = useState(
    props.mode === "edit" ? props.versionId : "",
  );
  const [definition, setDefinition] = useState<VisualizationDefinition>(
    () => editorInitialDefinition,
  );
  const [savedDefinition, setSavedDefinition] = useState<string | null>(() =>
    props.mode === "edit" ? JSON.stringify(props.initialDefinition) : null,
  );
  const [draftReady, setDraftReady] = useState(() => props.mode === "edit");
  const [openSections, setOpenSections] = useState<StudioSection[]>(() =>
    props.mode === "edit" ? ["visualization"] : ["applies", "visualization"],
  );
  const [previewExamplePickerOpen, setPreviewExamplePickerOpen] =
    useState(false);
  const [liveExamplePickerOpen, setLiveExamplePickerOpen] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [comparisonMode, setComparisonMode] =
    useState<ComparisonMode>("compare");
  const [rawDefinition, setRawDefinition] = useState(() =>
    JSON.stringify(editorInitialDefinition, null, 2),
  );

  const timeRange = useMemo(
    () => ({
      from: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
      to: new Date(),
    }),
    [],
  );
  const visualizations = api.customVisualizations.list.useQuery(
    { projectId },
    { enabled: hasAdminAccess },
  );
  const generationModel = api.customVisualizations.generationModel.useQuery(
    { projectId },
    { enabled: hasAdminAccess },
  );
  const saveVersion = api.customVisualizations.saveVersion.useMutation();
  const generateVersion =
    api.customVisualizations.generateVersion.useMutation();
  const publishVersion = api.customVisualizations.publishVersion.useMutation();
  const utils = api.useUtils();

  const selectedStoredVisualization = visualizations.data?.find(
    (item) => item.id === selectedVisualizationId,
  );
  const isLive =
    selectedStoredVisualization?.activeVersionId === selectedVersionId;
  const scopedDefinition = withMatchFilters(definition, browseFilters);
  const isDirty = JSON.stringify(scopedDefinition) !== savedDefinition;
  const canVisualizeTrace = browseFilters.some(
    (filter) =>
      filter.column === "isRootObservation" &&
      filter.operator === "=" &&
      filter.value === true,
  );
  const defaultMatch = api.events.listCursor.useQuery(
    {
      projectId,
      filter: [
        ...browseFilters,
        {
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: timeRange.from,
        },
        {
          column: "startTime",
          type: "datetime",
          operator: "<",
          value: timeRange.to,
        },
      ],
      searchQuery: null,
      searchType: [],
      limit: 1,
    },
    {
      enabled: !selectedObservation,
      refetchOnWindowFocus: false,
    },
  );
  const firstMatchingObservation = defaultMatch.data?.observations[0];

  const selectedIO = api.events.batchIO.useQuery(
    {
      projectId,
      observations: selectedObservation
        ? [
            {
              id: selectedObservation.id,
              traceId: selectedObservation.traceId!,
            },
          ]
        : [],
      minStartTime: selectedObservation?.startTime ?? new Date(0),
      maxStartTime: selectedObservation?.startTime ?? new Date(0),
      truncated: false,
      ioCharLimit: 10_000,
    },
    {
      ...sendAsPostOption,
      enabled: Boolean(
        selectedObservation?.traceId && selectedObservation.startTime,
      ),
    },
  );
  const io = selectedIO.data?.[0];
  const traceData = api.traces.byId.useQuery(
    {
      projectId,
      traceId: selectedObservation?.traceId ?? "",
      verbosity: "full",
    },
    {
      enabled: Boolean(selectedObservation?.traceId),
      refetchOnWindowFocus: false,
    },
  );

  const selectedTrace = api.events.listCursor.useInfiniteQuery(
    {
      projectId,
      filter: selectedObservation?.traceId
        ? [
            {
              column: "traceId",
              type: "string",
              operator: "=",
              value: selectedObservation.traceId,
            },
          ]
        : [],
      searchQuery: null,
      searchType: [],
      limit: 100,
    },
    {
      enabled: Boolean(selectedObservation?.traceId),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const generationMatches = api.events.listCursor.useQuery(
    {
      projectId,
      filter: [
        ...browseFilters,
        {
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: timeRange.from,
        },
        {
          column: "startTime",
          type: "datetime",
          operator: "<",
          value: timeRange.to,
        },
      ],
      searchQuery: null,
      searchType: [],
      limit: 16,
    },
    {
      enabled: Boolean(selectedObservation),
      refetchOnWindowFocus: false,
    },
  );
  const generationCandidates = useMemo(
    () =>
      selectDiverseObservations(
        [
          ...(selectedObservation ? [selectedObservation] : []),
          ...(generationMatches.data?.observations ?? []),
        ],
        selectedObservation?.id,
      ).filter(
        (
          observation,
        ): observation is typeof observation & { traceId: string } =>
          Boolean(observation.traceId),
      ),
    [generationMatches.data?.observations, selectedObservation],
  );
  const generationCandidateTimes = generationCandidates.map((observation) =>
    observation.startTime.getTime(),
  );
  const generationIO = api.events.batchIO.useQuery(
    {
      projectId,
      observations: generationCandidates.map((observation) => ({
        id: observation.id,
        traceId: observation.traceId,
      })),
      minStartTime: new Date(
        generationCandidateTimes.length
          ? Math.min(...generationCandidateTimes)
          : 0,
      ),
      maxStartTime: new Date(
        generationCandidateTimes.length
          ? Math.max(...generationCandidateTimes)
          : 0,
      ),
      truncated: false,
      ioCharLimit: 10_000,
    },
    {
      ...sendAsPostOption,
      enabled: generationCandidates.length > 0,
      refetchOnWindowFocus: false,
    },
  );
  const traceObservations = useMemo(
    () =>
      selectedTrace.data?.pages.flatMap((page) => page.observations) ??
      (selectedObservation ? [selectedObservation] : []),
    [selectedObservation, selectedTrace.data?.pages],
  );
  const generationExamples = useMemo(() => {
    const ioById = new Map(
      (generationIO.data ?? []).map((item) => [item.id, item]),
    );
    return generationCandidates.map((observation) => {
      const candidateIO = ioById.get(observation.id);
      return {
        role:
          observation.id === selectedObservation?.id
            ? ("selected" as const)
            : ("matching" as const),
        name: observation.name ?? undefined,
        type: observation.type,
        level: observation.level,
        statusMessage: observation.statusMessage ?? undefined,
        inputPreview: compactContextPreview(candidateIO?.input),
        outputPreview: compactContextPreview(candidateIO?.output),
        metadataPreview: compactContextPreview(candidateIO?.metadata),
        shape: compactContextPreview({
          input: describeShape(candidateIO?.input),
          output: describeShape(candidateIO?.output),
          metadata: describeShape(candidateIO?.metadata),
        }),
      };
    });
  }, [generationCandidates, generationIO.data, selectedObservation?.id]);
  const generationReferences = useMemo(() => {
    const currentFilters = JSON.stringify(browseFilters);
    return (visualizations.data ?? [])
      .flatMap((visualization) => {
        const version =
          visualization.activeVersion ?? visualization.versions.at(0);
        if (!version || version.id === selectedVersionId) return [];
        const parsed = VisualizationDefinitionSchema.safeParse(
          version.definition,
        );
        if (!parsed.success) return [];
        const reference = parsed.data;
        let relevance = 0;
        if (reference.match.entity === definition.match.entity) relevance += 5;
        if (reference.binding.source === definition.binding.source)
          relevance += 4;
        if (reference.placement.surface === definition.placement.surface)
          relevance += 3;
        if (JSON.stringify(reference.match.filters) === currentFilters)
          relevance += 6;
        return [{ reference, relevance }];
      })
      .sort((left, right) => right.relevance - left.relevance)
      .slice(0, 4)
      .map(({ reference }) => ({
        title: reference.title,
        summary: reference.summary,
        catalogVersion: reference.catalogVersion,
        bindingSource: reference.binding.source,
        matchSummary: matchRuleSummary(reference.match.filters),
        specExcerpt: compactContextPreview(reference.spec, 5_000),
      }));
  }, [
    browseFilters,
    definition.binding.source,
    definition.match.entity,
    definition.placement.surface,
    selectedVersionId,
    visualizations.data,
  ]);
  const previewData = useMemo<VisualizationDataEnvelope>(() => {
    const observation = selectedObservation
      ? {
          ...selectedObservation,
          input: io?.input,
          output: io?.output,
          metadata: io?.metadata,
        }
      : undefined;
    let selectedValue: unknown = observation;
    if (definition.binding.source === "OBSERVATION_INPUT") {
      selectedValue = io?.input;
    } else if (definition.binding.source === "OBSERVATION_OUTPUT") {
      selectedValue = io?.output;
    }
    let observations: Array<Record<string, unknown>> = [];
    if (definition.binding.source === "TRACE") {
      observations = traceObservations;
    } else if (observation) {
      observations = [observation];
    }
    return {
      envelopeVersion: "1",
      data: {
        trace: selectedObservation
          ? {
              id: selectedObservation.traceId,
              name: selectedObservation.traceName,
              latency: selectedObservation.latency,
              input: traceData.data?.input,
              output: traceData.data?.output,
              metadata: traceData.data?.metadata,
              environment: traceData.data?.environment,
            }
          : { name: "Select an example" },
        observations,
        observation,
        selectedValue,
      },
      meta: {
        surface: definition.placement.surface,
        source: definition.binding.source,
      },
      scores: [],
    };
  }, [
    definition.binding.source,
    definition.placement.surface,
    io,
    selectedObservation,
    traceData.data,
    traceObservations,
  ]);

  const selectDefinition = (
    next: VisualizationDefinition,
    visualizationId = selectedVisualizationId,
    versionId = "",
    ready = true,
  ) => {
    setDefinition(next);
    setBrowseFilters(next.match.filters);
    setRawDefinition(JSON.stringify(next, null, 2));
    setSelectedVisualizationId(visualizationId);
    setSelectedVersionId(versionId);
    setSavedDefinition(versionId ? JSON.stringify(next) : null);
    setDraftReady(ready);
  };

  const updateDefinition = (next: VisualizationDefinition) => {
    setDefinition(next);
    setRawDefinition(JSON.stringify(next, null, 2));
  };

  const updateMatchFilters = (filters: FilterState) => {
    setBrowseFilters(filters);
    updateDefinition(withMatchFilters(definition, filters));
  };

  const openExampleContext = (observation: SampleObservation) => {
    setSelectedObservation(observation);
    if (definition.placement.surface === "SESSION" && observation.sessionId) {
      router
        .push(
          `/project/${projectId}/sessions/${encodeURIComponent(observation.sessionId)}`,
        )
        .catch(() => undefined);
      return;
    }
    if (!observation.traceId) return;
    const params = new URLSearchParams({
      peek: observation.traceId,
      observation: observation.id,
      timestamp: observation.startTime.toISOString(),
    });
    router
      .push(`/project/${projectId}/traces?${params.toString()}`)
      .catch(() => undefined);
  };

  const updateSource = (
    source: "TRACE" | "OBSERVATION_INPUT" | "OBSERVATION_OUTPUT",
  ) => {
    if (source === definition.binding.source) return;
    if (source === "TRACE") {
      if (!canVisualizeTrace) {
        showToast({
          type: "INFO",
          title:
            "Filter examples to Root spans before designing a whole-trace view.",
          analytics: {
            operation: "custom_visualization.definition_apply",
          },
        });
        return;
      }
      updateDefinition(TRACE_STARTER);
      setBrowseFilters(TRACE_STARTER.match.filters);
      setDraftReady(false);
      return;
    }
    updateDefinition({
      ...definition,
      match: { entity: "OBSERVATION", filters: browseFilters },
      placement: {
        surface: "SESSION",
        slot: source,
        injection: "AFTER",
        anchor: {},
      },
      binding: { source },
    });
    setDraftReady(false);
  };

  const handleSave = async () => {
    try {
      const createsNewCustomUi = !selectedVisualizationId;
      const result = await saveVersion.mutateAsync({
        projectId,
        visualizationId: selectedVisualizationId || undefined,
        definition: scopedDefinition,
      });
      setDefinition(scopedDefinition);
      setRawDefinition(JSON.stringify(scopedDefinition, null, 2));
      setSelectedVisualizationId(result.visualizationId);
      setSelectedVersionId(result.id);
      setSavedDefinition(JSON.stringify(scopedDefinition));
      const analytics = customUiAnalyticsDimensions(scopedDefinition);
      capture("custom_ui:version_saved", {
        ...analytics,
        source: "manual",
      });
      if (createsNewCustomUi) capture("custom_ui:created", analytics);
      await utils.customVisualizations.list.invalidate({ projectId });
      if (props.mode === "create") {
        await router.replace(
          `/project/${projectId}/visualizations/${result.visualizationId}`,
        );
      }
      showSuccessToast({
        operation: "customVisualizations.saveVersion",
        title: "Custom UI version saved",
        description: `Saved immutable version ${result.version}.`,
      });
    } catch (error) {
      showErrorToast(
        "Could not save version",
        error instanceof Error ? error.message : "Please try again.",
        classifyTrpcToastError(error, "customVisualizations.saveVersion"),
      );
    }
  };

  const generateFromPrompt = async (generationPrompt: string) => {
    try {
      const createsNewCustomUi = !selectedVisualizationId;
      capture("custom_ui:generation_requested", {
        placement:
          definition.placement.surface === "TRACE" ? "trace" : "session",
        catalogVersion: definition.catalogVersion,
        isRefinement: draftReady,
      });
      const samplePreview = compactContextPreview(
        {
          observationType: selectedObservation?.type,
          observationName: selectedObservation?.name,
          traceName: selectedObservation?.traceName,
          input: describeShape(io?.input),
          output: describeShape(io?.output),
          ...(definition.binding.source === "TRACE"
            ? {
                observationTypes: Array.from(
                  new Set(traceObservations.map((item) => item.type)),
                ),
                selectedTraceSequence: traceObservations
                  .slice(0, 60)
                  .map((item) => ({
                    name: item.name,
                    type: item.type,
                    level: item.level,
                    statusMessage: item.statusMessage,
                    latency: item.latency,
                    parentObservationId: item.parentObservationId,
                  })),
              }
            : {}),
        },
        4_000,
      );
      let field: "input" | "output" | undefined;
      if (definition.binding.source === "OBSERVATION_INPUT") field = "input";
      if (definition.binding.source === "OBSERVATION_OUTPUT") field = "output";
      const result = await generateVersion.mutateAsync({
        projectId,
        visualizationId: selectedVisualizationId || undefined,
        prompt: generationPrompt,
        currentDefinition: withMatchFilters(definition, browseFilters),
        context: {
          source:
            definition.match.entity === "OBSERVATION" ? "observation" : "trace",
          observationType: selectedObservation?.type,
          observationName: selectedObservation?.name ?? undefined,
          field,
          samplePreview,
          examples: generationExamples,
          references: generationReferences,
        },
      });
      selectDefinition(
        withMatchFilters(result.definition, browseFilters),
        result.visualizationId,
        result.id,
      );
      const analytics = customUiAnalyticsDimensions(result.definition);
      capture("custom_ui:version_saved", { ...analytics, source: "ai" });
      if (createsNewCustomUi) capture("custom_ui:created", analytics);
      await utils.customVisualizations.list.invalidate({ projectId });
      if (props.mode === "create") {
        await router.replace(
          `/project/${projectId}/visualizations/${result.visualizationId}`,
        );
      }
      showSuccessToast({
        operation: "customVisualizations.generateVersion",
        title: "Custom UI generated",
        description: `Generated version ${result.version}.`,
      });
      return true;
    } catch (error) {
      showErrorToast(
        "Could not generate version",
        error instanceof Error ? error.message : "Please try again.",
        classifyTrpcToastError(error, "customVisualizations.generateVersion"),
      );
      return false;
    }
  };

  const handleGenerate = () => generateFromPrompt(prompt);
  const handleAutoGenerate = () => {
    const additionalDirection = prompt.trim()
      ? `\n\nUser direction: ${prompt.trim()}`
      : "";
    if (definition.binding.source === "TRACE") {
      return generateFromPrompt(
        `Analyze this whole trace structure and generate the most useful Custom UI for understanding its sequence, observation mix, latency, tool activity, errors, and outputs. Prefer a concise story over a complete data dump.${additionalDirection}`,
      );
    }
    const field =
      definition.binding.source === "OBSERVATION_INPUT" ? "input" : "output";
    return generateFromPrompt(
      `Analyze this observation ${field} structure and generate the clearest Custom UI for understanding this data inside a session. Prefer a concise story over a complete data dump.${additionalDirection}`,
    );
  };

  const handlePublish = async () => {
    if (!selectedVisualizationId || !selectedVersionId || isDirty) return;
    try {
      await publishVersion.mutateAsync({
        projectId,
        visualizationId: selectedVisualizationId,
        versionId: selectedVersionId,
      });
      await Promise.all([
        utils.customVisualizations.list.invalidate({ projectId }),
        utils.customVisualizations.active.invalidate({ projectId }),
      ]);
      capture(
        "custom_ui:published",
        customUiAnalyticsDimensions(scopedDefinition),
      );
      showSuccessToast({
        operation: "customVisualizations.publishVersion",
        title: "Custom UI published",
        description: "Existing viewers now use this exact version.",
      });
    } catch (error) {
      showErrorToast(
        "Could not publish version",
        error instanceof Error ? error.message : "Please try again.",
        classifyTrpcToastError(error, "customVisualizations.publishVersion"),
      );
    }
  };

  if (!hasAdminAccess) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-md p-6 text-center">
          <h1 className="text-lg">Custom UI is for Langfuse admins</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Enable the employee preview to design and publish Custom UI.
          </p>
        </Card>
      </div>
    );
  }

  const sourceLabel = bindingLabel(definition.binding.source);
  const isTraceSurface = definition.placement.surface === "TRACE";
  const draftStatus = (() => {
    if (!draftReady) return "Not generated";
    if (isDirty) return "Unsaved draft";
    if (isLive) return "Live version";
    return "Saved version";
  })();
  const defaultSurfaceDescription = isTraceSurface
    ? "Current Trace data view"
    : "Current Session view";
  const visualizedSurfaceDescription = (() => {
    if (!draftReady) return "Generate a first draft";
    if (isTraceSurface) return "Custom UI in the Trace detail tab";
    return "Custom UI after the matching Session item";
  })();
  const defaultSurfacePreview = isTraceSurface ? (
    <TraceDataPreview
      projectId={projectId}
      observation={selectedObservation}
      trace={traceData.data}
      loading={traceData.isLoading}
    />
  ) : (
    <SessionContextPreview observation={selectedObservation} io={io} />
  );
  const visualizedSurfacePreview = (() => {
    if (!draftReady) {
      return (
        <div className="text-muted-foreground flex min-h-[360px] flex-col items-center justify-center gap-2 p-8 text-center text-sm">
          <Sparkles className="icon-lg" />
          <span>No Custom UI generated for this surface yet.</span>
        </div>
      );
    }
    if (!selectedObservation) {
      return (
        <div className="text-muted-foreground flex min-h-[360px] items-center justify-center p-8 text-center text-sm">
          Choose an example to render this draft.
        </div>
      );
    }
    if (isTraceSurface) {
      return (
        <TraceVisualizationPreview definition={definition} data={previewData} />
      );
    }
    return (
      <SessionVisualizationPreview
        observation={selectedObservation}
        definition={definition}
        data={previewData}
      />
    );
  })();
  const generationModelLabel = generationModel.data
    ? `${generationModel.data.provider} / ${generationModel.data.modelId}`
    : "Instance model unavailable";
  const generationContextPending =
    generationMatches.isFetching ||
    generationIO.isFetching ||
    visualizations.isLoading;
  const generationContextLabel = generationContextPending
    ? "preparing representative examples…"
    : `${generationExamples.length} data examples · ${generationReferences.length} saved references`;
  const generationDisabled =
    !selectedObservation ||
    !generationModel.data ||
    generationContextPending ||
    generateVersion.isPending;
  const effectiveComparisonMode = draftReady ? comparisonMode : "default";
  const generationDialog = (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <Dialog
          title={draftReady ? "Refine Custom UI" : "Generate Custom UI"}
          actions={[
            {
              label: draftReady ? "Generate version" : "Generate",
              icon: WandSparkles,
              loading: generateVersion.isPending,
              disabled: generationDisabled,
              onClick: async () => {
                const generated = draftReady
                  ? await handleGenerate()
                  : await handleAutoGenerate();
                if (generated) closeDialog();
              },
            },
          ]}
        >
          <Dialog.Body>
            <div>
              <label htmlFor="visualization-prompt" className="font-bold">
                What should it show?
              </label>
              <p className="text-muted-foreground mt-1 text-xs">
                We use the selected example, other filter matches, and relevant
                saved Custom UI to infer a useful view.
              </p>
              <Textarea
                id="visualization-prompt"
                className="ph-no-capture mt-3 min-h-28"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {generationModelLabel} · {generationContextLabel}
            </p>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => (
        <Button onClick={() => openDialog()} disabled={!selectedObservation}>
          <WandSparkles className="icon-base mr-2" />
          {draftReady ? "Refine" : "Generate"}
        </Button>
      )}
    </DialogController>
  );

  return (
    <div className="bg-muted/15 flex min-h-full flex-col">
      <div
        hidden
        ref={
          !selectedObservation && firstMatchingObservation
            ? (element) => {
                if (element) setSelectedObservation(firstMatchingObservation);
              }
            : undefined
        }
      />
      <header className="bg-background sticky top-0 z-20 border-b px-5 py-3 md:px-8">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link href={`/project/${projectId}/visualizations`}>
                <ArrowLeft className="icon-base" />
                <span className="sr-only">Back to Custom UI</span>
              </Link>
            </Button>
            <div className="min-w-0">
              <h1
                className="truncate text-lg font-bold tracking-tight"
                title={
                  props.mode === "create" ? "New Custom UI" : "Edit Custom UI"
                }
              >
                {props.mode === "create" ? "New Custom UI" : "Edit Custom UI"}
              </h1>
              <p className="text-muted-foreground hidden text-sm sm:block">
                Choose where it appears, then design it with a real example.
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={isDirty ? "secondary" : "outline"}>
              {draftStatus}
            </Badge>
            <Popover
              open={liveExamplePickerOpen}
              onOpenChange={setLiveExamplePickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!selectedStoredVisualization?.activeVersion}
                  title={
                    selectedStoredVisualization?.activeVersion
                      ? "Choose a matching example to open with the live Custom UI"
                      : "Publish a version before previewing it live"
                  }
                >
                  <Eye className="icon-base mr-2" />
                  See live
                  <ChevronDown className="icon-base ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[min(34rem,calc(100vw-2rem))] p-4"
              >
                <div className="mb-3">
                  <div className="text-sm font-bold">Preview live on</div>
                  <p className="text-muted-foreground text-xs">
                    Choose a matching observation to open in Langfuse.
                  </p>
                </div>
                <div className="h-[min(50vh,420px)] overflow-hidden [&>div]:h-full">
                  <EvaluatorSampleObservationSelector
                    projectId={projectId}
                    timeRange={timeRange}
                    selectedObservationId={selectedObservation?.id ?? null}
                    filterState={browseFilters}
                    onFilterStateChange={updateMatchFilters}
                    onSelect={setSelectedObservation}
                    onActivate={(observation) => {
                      setLiveExamplePickerOpen(false);
                      openExampleContext(observation);
                    }}
                    onOpenTrace={openExampleContext}
                    displayMode="compact-list"
                    sections="matches"
                  />
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={!draftReady || saveVersion.isPending}
            >
              <Save className="icon-base mr-2" /> Save version
            </Button>
            <Button
              onClick={handlePublish}
              disabled={
                !selectedVersionId ||
                isDirty ||
                isLive ||
                publishVersion.isPending
              }
              title={
                isDirty ? "Save this draft before publishing it" : undefined
              }
            >
              <Play className="icon-base mr-2" />
              {isLive ? "Live" : "Publish version"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl p-4 md:p-8">
        <div className="space-y-8">
          <Card className="p-5 md:p-6">
            <div className="min-w-0 space-y-1">
              <Input
                value={definition.title}
                onChange={(event) =>
                  updateDefinition({ ...definition, title: event.target.value })
                }
                className="h-auto border-0 px-0 text-xl font-bold shadow-none focus-visible:ring-0"
              />
              <Input
                value={definition.summary}
                onChange={(event) =>
                  updateDefinition({
                    ...definition,
                    summary: event.target.value,
                  })
                }
                className="text-muted-foreground h-auto border-0 px-0 text-sm shadow-none focus-visible:ring-0"
              />
              <p className="text-muted-foreground pt-1 text-xs">
                {selectedStoredVisualization?.activeVersion
                  ? `Live v${selectedStoredVisualization.activeVersion.version} remains unchanged until you publish another version.`
                  : "Nothing is shown to viewers until you publish a saved version."}
              </p>
            </div>
          </Card>

          <Accordion
            type="multiple"
            gap="lg"
            value={openSections}
            onValueChange={(value) => setOpenSections(value as StudioSection[])}
          >
            <Card className="overflow-hidden [&>div]:border-b-0">
              <Accordion.Item value="applies">
                <div className="px-5 md:px-6">
                  <Accordion.Trigger>
                    <div className="min-w-0 flex-1 py-3 text-left">
                      <div className="text-muted-foreground text-xs font-normal">
                        1 · Applies to
                      </div>
                      {!openSections.includes("applies") ? (
                        <VisualizationFilterTokens
                          filters={browseFilters}
                          entity={definition.match.entity}
                        />
                      ) : null}
                    </div>
                  </Accordion.Trigger>
                  <Accordion.Content>
                    <div className="space-y-6 pt-3 pb-6">
                      <EvaluatorSampleObservationSelector
                        projectId={projectId}
                        timeRange={timeRange}
                        selectedObservationId={selectedObservation?.id ?? null}
                        filterState={browseFilters}
                        onFilterStateChange={updateMatchFilters}
                        onSelect={setSelectedObservation}
                        onOpenTrace={openExampleContext}
                        displayMode="compact-list"
                        sections="filters"
                      />
                      <div>
                        <div className="h-[min(45vh,420px)] min-h-64 overflow-hidden [&>div]:h-full">
                          <EvaluatorSampleObservationSelector
                            projectId={projectId}
                            timeRange={timeRange}
                            selectedObservationId={
                              selectedObservation?.id ?? null
                            }
                            filterState={browseFilters}
                            onFilterStateChange={updateMatchFilters}
                            onSelect={setSelectedObservation}
                            onOpenTrace={openExampleContext}
                            displayMode="compact-list"
                            sections="matches"
                          />
                        </div>
                      </div>
                    </div>
                  </Accordion.Content>
                </div>
              </Accordion.Item>
            </Card>

            <Card className="overflow-hidden [&>div]:border-b-0">
              <Accordion.Item value="placement">
                <div className="px-5 md:px-6">
                  <Accordion.Trigger>
                    <div className="min-w-0 flex-1 py-3 text-left">
                      <div className="text-muted-foreground text-xs font-normal">
                        2 · Appears in
                      </div>
                      <div
                        className="mt-1 truncate text-sm font-bold"
                        title={sourceLabel}
                      >
                        {sourceLabel}
                      </div>
                    </div>
                  </Accordion.Trigger>
                  <Accordion.Content>
                    <div className="space-y-5 pt-3 pb-6">
                      <div className="grid gap-2 sm:grid-cols-3">
                        {(
                          [
                            ["OBSERVATION_INPUT", "Session input"],
                            ["OBSERVATION_OUTPUT", "Session output"],
                            ["TRACE", "Trace data"],
                          ] as const
                        ).map(([source, label]) => {
                          const selected = definition.binding.source === source;
                          const disabled =
                            source === "TRACE" &&
                            !canVisualizeTrace &&
                            definition.binding.source !== "TRACE";
                          return (
                            <button
                              key={source}
                              type="button"
                              onClick={() => updateSource(source)}
                              disabled={disabled}
                              className={`rounded-lg border p-4 text-left transition-colors ${
                                selected
                                  ? "border-primary bg-primary/5 ring-primary/20 ring-1"
                                  : "hover:bg-muted/40"
                              } disabled:cursor-not-allowed disabled:opacity-40`}
                            >
                              <span className="block text-sm font-bold">
                                {label}
                              </span>
                              <span className="text-muted-foreground mt-1 block text-xs">
                                {source === "TRACE"
                                  ? "A dedicated trace detail view"
                                  : `Inserted after the observation ${source === "OBSERVATION_INPUT" ? "input" : "output"}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {!canVisualizeTrace && !isTraceSurface ? (
                        <p className="text-muted-foreground text-xs">
                          Trace data becomes available when the filter matches
                          root observations.
                        </p>
                      ) : null}
                    </div>
                  </Accordion.Content>
                </div>
              </Accordion.Item>
            </Card>

            <Card className="overflow-hidden [&>div]:border-b-0">
              <Accordion.Item value="visualization">
                <div className="px-5 md:px-6">
                  <Accordion.Trigger>
                    <div className="min-w-0 flex-1 py-3 text-left">
                      <div className="text-muted-foreground text-xs font-normal">
                        3 · Custom UI
                      </div>
                      <div
                        className="mt-1 truncate text-sm font-bold"
                        title={draftReady ? draftStatus : "Ready to generate"}
                      >
                        {draftReady ? draftStatus : "Ready to generate"}
                      </div>
                    </div>
                  </Accordion.Trigger>
                  <Accordion.Content>
                    <div className="space-y-5 pt-3 pb-6">
                      <div>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h2 className="text-sm font-bold">Preview</h2>
                            <p className="text-muted-foreground text-xs">
                              {draftReady
                                ? "Compare this version with the current Langfuse view."
                                : "Start from the current Langfuse view."}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Popover
                              open={previewExamplePickerOpen}
                              onOpenChange={setPreviewExamplePickerOpen}
                            >
                              <PopoverTrigger asChild>
                                <Button variant="outline">
                                  {selectedObservation ? (
                                    <ItemBadge
                                      type={
                                        selectedObservation.type as LangfuseItemType
                                      }
                                      isSmall
                                    />
                                  ) : null}
                                  <span
                                    className="max-w-48 truncate"
                                    title={
                                      selectedObservation?.name ??
                                      "Choose example"
                                    }
                                  >
                                    {selectedObservation?.name ??
                                      "Choose example"}
                                  </span>
                                  <ChevronDown className="icon-base ml-1" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="end"
                                className="w-[min(34rem,calc(100vw-2rem))] p-4"
                              >
                                <div className="mb-3">
                                  <div className="text-sm font-bold">
                                    Choose example
                                  </div>
                                  <p className="text-muted-foreground text-xs">
                                    Matching observations from the rule above.
                                  </p>
                                </div>
                                <div className="h-[min(50vh,420px)] overflow-hidden [&>div]:h-full">
                                  <EvaluatorSampleObservationSelector
                                    projectId={projectId}
                                    timeRange={timeRange}
                                    selectedObservationId={
                                      selectedObservation?.id ?? null
                                    }
                                    filterState={browseFilters}
                                    onFilterStateChange={updateMatchFilters}
                                    onSelect={setSelectedObservation}
                                    onActivate={(observation) => {
                                      setSelectedObservation(observation);
                                      setPreviewExamplePickerOpen(false);
                                    }}
                                    onOpenTrace={openExampleContext}
                                    displayMode="compact-list"
                                    sections="matches"
                                  />
                                </div>
                              </PopoverContent>
                            </Popover>
                            {draftReady ? (
                              <div className="bg-muted/20 flex rounded-lg border p-1">
                                {(
                                  ["compare", "default", "visualized"] as const
                                ).map((mode) => (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => {
                                      setComparisonMode(mode);
                                      if (mode === "default") {
                                        capture(
                                          "custom_ui:default_view_selected",
                                          {
                                            placement:
                                              definition.placement.surface ===
                                              "TRACE"
                                                ? "trace"
                                                : "session",
                                            catalogVersion:
                                              definition.catalogVersion,
                                          },
                                        );
                                      }
                                    }}
                                    className={`rounded-md px-3 py-1.5 text-xs capitalize transition-colors ${
                                      effectiveComparisonMode === mode
                                        ? "bg-background font-bold shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    {mode}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            {generationDialog}
                          </div>
                        </div>

                        <div
                          className={`grid gap-3 ${
                            effectiveComparisonMode === "compare"
                              ? "lg:grid-cols-2"
                              : "grid-cols-1"
                          }`}
                        >
                          {effectiveComparisonMode !== "visualized" ? (
                            <section className="bg-background overflow-hidden rounded-xl border">
                              <div className="flex items-center justify-between border-b px-4 py-2.5">
                                <div>
                                  <div className="text-xs font-bold">
                                    Default
                                  </div>
                                  <div className="text-muted-foreground text-[11px]">
                                    {defaultSurfaceDescription}
                                  </div>
                                </div>
                                <Badge variant="outline">{sourceLabel}</Badge>
                              </div>
                              {defaultSurfacePreview}
                            </section>
                          ) : null}

                          {draftReady &&
                          effectiveComparisonMode !== "default" ? (
                            <section className="ph-no-capture bg-background overflow-hidden rounded-xl border">
                              <div className="flex items-center justify-between border-b px-4 py-2.5">
                                <div>
                                  <div className="text-xs font-bold">
                                    Custom UI
                                  </div>
                                  <div className="text-muted-foreground text-[11px]">
                                    {visualizedSurfaceDescription}
                                  </div>
                                </div>
                                <Badge variant="outline">
                                  {definition.catalogVersion}
                                </Badge>
                              </div>
                              {visualizedSurfacePreview}
                            </section>
                          ) : null}
                        </div>
                      </div>

                      <details className="rounded-lg border">
                        <summary className="flex cursor-pointer list-none items-center justify-between p-4">
                          <span className="text-sm font-bold">Advanced</span>
                          <Badge variant="outline">
                            {definition.catalogVersion}
                          </Badge>
                        </summary>
                        <div className="space-y-6 border-t p-4">
                          {selectedStoredVisualization ? (
                            <section className="space-y-3">
                              <div>
                                <h3 className="text-sm font-bold">Versions</h3>
                                <p className="text-muted-foreground text-xs">
                                  Saved versions are immutable.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {selectedStoredVisualization.versions.map(
                                  (version) => {
                                    const parsed =
                                      VisualizationDefinitionSchema.safeParse(
                                        version.definition,
                                      );
                                    if (!parsed.success) return null;
                                    const live =
                                      selectedStoredVisualization.activeVersionId ===
                                      version.id;
                                    return (
                                      <Button
                                        key={version.id}
                                        type="button"
                                        variant={
                                          selectedVersionId === version.id
                                            ? "secondary"
                                            : "outline"
                                        }
                                        size="sm"
                                        onClick={() =>
                                          selectDefinition(
                                            parsed.data,
                                            selectedStoredVisualization.id,
                                            version.id,
                                          )
                                        }
                                      >
                                        v{version.version}
                                        {live ? " · live" : ""}
                                      </Button>
                                    );
                                  },
                                )}
                              </div>
                            </section>
                          ) : null}

                          <section className="space-y-3">
                            <div>
                              <h3 className="text-sm font-bold">Definition</h3>
                              <p className="text-muted-foreground text-xs">
                                Edit matching, placement, data binding, and the
                                declarative component tree directly.
                              </p>
                            </div>
                            <Textarea
                              className="ph-no-capture font-mono text-xs"
                              rows={20}
                              value={rawDefinition}
                              onChange={(event) =>
                                setRawDefinition(event.target.value)
                              }
                            />
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  try {
                                    const parsed =
                                      VisualizationDefinitionSchema.parse(
                                        JSON.parse(rawDefinition),
                                      );
                                    setDefinition(parsed);
                                    setBrowseFilters(parsed.match.filters);
                                    setDraftReady(true);
                                    showSuccessToast({
                                      operation:
                                        "custom_visualization.definition_apply",
                                      title: "Definition applied",
                                      description:
                                        "The definition was applied to this draft.",
                                    });
                                  } catch (error) {
                                    showErrorToast(
                                      "Invalid definition",
                                      error instanceof Error
                                        ? error.message
                                        : "Check the JSON and try again.",
                                      {
                                        operation:
                                          "custom_visualization.definition_apply",
                                        errorOrigin: "frontend",
                                        errorCategory: "user_input",
                                      },
                                    );
                                  }
                                }}
                              >
                                <Check className="icon-base mr-2" /> Apply
                                definition
                              </Button>
                            </div>
                          </section>
                        </div>
                      </details>
                    </div>
                  </Accordion.Content>
                </div>
              </Accordion.Item>
            </Card>
          </Accordion>
        </div>
      </main>
    </div>
  );
}
