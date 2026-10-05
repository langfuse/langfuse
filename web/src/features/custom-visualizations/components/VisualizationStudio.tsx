import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  ChartNoAxesCombined,
  Check,
  Code2,
  FlaskConical,
  Play,
  Save,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { FilterState } from "@langfuse/shared";

import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { Badge } from "@/src/components/ui/badge";
import { api, sendAsPostOption } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac";
import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
import { EvaluatorSampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorSampleObservationSelector/EvaluatorSampleObservationSelector";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { VisualizationRenderer } from "./VisualizationRenderer";
import {
  compactContextPreview,
  selectDiverseObservations,
} from "../fns/visualizationGenerationContext";
import {
  SHADER_STARTER,
  TOOL_STARTER,
  TRACE_STARTER,
  VisualizationDefinitionSchema,
  type VisualizationDataEnvelope,
  type VisualizationDefinition,
} from "../types";

const DEFAULT_PROMPT =
  "Make the important sequence, tool activity, errors, and outputs easier to understand at a glance.";

type ComparisonMode = "compare" | "default" | "visualized";
type RendererPreference = "auto" | VisualizationDefinition["renderer"]["kind"];

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

const rendererLabel = (definition: VisualizationDefinition) =>
  ({
    template: "Template",
    chart: "Chart",
    react: "React lab",
    shader: "Three / shader lab",
  })[definition.renderer.kind];

const bindingLabel = (source: VisualizationDefinition["binding"]["source"]) => {
  if (source === "TRACE") return "Trace data view";
  if (source === "OBSERVATION_INPUT") return "Session · after input";
  if (source === "OBSERVATION_OUTPUT") return "Session · after output";
  return "Transcript";
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
      return `${filter.column} ${filter.operator} ${value}`;
    })
    .join(" · ");
};

const audienceSummary = (filters: FilterState) => {
  if (filters.length === 0) return "Every observation";
  const type = filters.find((filter) => filter.column === "type")?.value;
  const name = filters.find((filter) => filter.column === "name")?.value;
  const isRoot = filters.find(
    (filter) => filter.column === "isRootObservation",
  )?.value;
  if (Array.isArray(type) && type.length === 1 && type[0] === "TOOL") {
    return name ? `Tool calls named “${String(name)}”` : "Tool calls";
  }
  if (name) return `Observations named “${String(name)}”`;
  if (isRoot === true) return "Root observations";
  if (Array.isArray(type) && type.length === 1) {
    return `${String(type[0]).toLowerCase()} observations`;
  }
  return `Observations matching ${filters.length} ${
    filters.length === 1 ? "condition" : "conditions"
  }`;
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
        showMetadata
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
        <VisualizationRenderer definition={definition} data={data} />
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
      <VisualizationRenderer definition={definition} data={data} />
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
  const [draftReady, setDraftReady] = useState(
    () =>
      props.mode === "edit" ||
      routeContext.source === "trace" ||
      routeContext.source === "observation",
  );
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [comparisonMode, setComparisonMode] =
    useState<ComparisonMode>("compare");
  const [rendererPreference, setRendererPreference] =
    useState<RendererPreference>("auto");
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
        rendererKind: reference.renderer.kind,
        bindingSource: reference.binding.source,
        matchSummary: matchRuleSummary(reference.match.filters),
        rendererExcerpt: compactContextPreview(reference.renderer, 5_000),
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
    if (
      definition.binding.source === "TRACE" ||
      definition.binding.source === "TRANSCRIPT"
    ) {
      observations = traceObservations;
    } else if (observation) {
      observations = [observation];
    }
    return {
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
    };
  }, [
    definition.binding.source,
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
    if (source === "TRACE") {
      if (!canVisualizeTrace) {
        toast.info(
          "Filter examples to Root spans before designing a whole-trace view.",
        );
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

  const applyRenderer = (kind: VisualizationDefinition["renderer"]["kind"]) => {
    setDraftReady(true);
    if (kind === "template") {
      updateDefinition({ ...definition, renderer: TRACE_STARTER.renderer });
      return;
    }
    if (kind === "chart") {
      updateDefinition({
        ...definition,
        renderer: {
          kind: "chart",
          chart: "bar",
          dataPath: "observations",
          xKey: "name",
          yKey: "latency",
          color: "#4f46e5",
        },
      });
      return;
    }
    if (kind === "react") {
      updateDefinition({
        ...definition,
        renderer: {
          kind: "react",
          source: `
const value = viz.parse(data.selectedValue);
const title = viz.first(data.observation?.name, data.trace?.name, "Custom view");
const facts = viz.entries(value, 4).map(([label, item]) => ({ label, value: viz.text(item, "", 160) }));
root.append(ui.stack([
  ui.el("div", { className: "eyebrow", text: "INTERACTIVE VIEW" }),
  ui.ellipsis(title, 56),
  ui.sentence(["This record exposes ", { emphasis: Array.isArray(value) ? value.length + " items" : facts.length + " useful fields" }, "."]),
  ui.facts(facts),
  ui.accordion("Raw evidence", ui.code(value))
]));`,
        },
      });
      return;
    }
    updateDefinition({ ...definition, renderer: SHADER_STARTER.renderer });
  };

  const handleSave = async () => {
    try {
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
      await utils.customVisualizations.list.invalidate({ projectId });
      if (props.mode === "create") {
        await router.replace(
          `/project/${projectId}/visualizations/${result.visualizationId}`,
        );
      }
      toast.success(`Saved immutable version ${result.version}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save version",
      );
    }
  };

  const generateFromPrompt = async (generationPrompt: string) => {
    try {
      const samplePreview = compactContextPreview(
        {
          observationType: selectedObservation?.type,
          observationName: selectedObservation?.name,
          traceName: selectedObservation?.traceName,
          input: describeShape(io?.input),
          output: describeShape(io?.output),
          ...(definition.binding.source === "TRACE" ||
          definition.binding.source === "TRANSCRIPT"
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
      const rendererInstruction =
        rendererPreference === "auto"
          ? "Choose the renderer that best fits the selected data shape."
          : `Use the ${rendererPreference} renderer.`;
      const result = await generateVersion.mutateAsync({
        projectId,
        visualizationId: selectedVisualizationId || undefined,
        prompt: `${generationPrompt}\n\nRenderer instruction: ${rendererInstruction}`,
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
      await utils.customVisualizations.list.invalidate({ projectId });
      if (props.mode === "create") {
        await router.replace(
          `/project/${projectId}/visualizations/${result.visualizationId}`,
        );
      }
      toast.success(`Generated version ${result.version}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not generate version",
      );
    }
  };

  const handleGenerate = () => generateFromPrompt(prompt);
  const handleAutoGenerate = () => {
    if (definition.binding.source === "TRACE") {
      return generateFromPrompt(
        "Analyze this whole trace structure and generate the most useful visualization for understanding its sequence, observation mix, latency, tool activity, errors, and outputs. Choose a renderer that fits the actual fields instead of producing generic HTML.",
      );
    }
    const field =
      definition.binding.source === "OBSERVATION_INPUT" ? "input" : "output";
    return generateFromPrompt(
      `Analyze this observation ${field} structure and generate the clearest visualization for understanding this data inside a session. Choose the renderer and hierarchy based on the actual shape.`,
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
      toast.success("Published. Existing viewers now use this exact version.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not publish version",
      );
    }
  };

  if (!hasAdminAccess) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-md p-6 text-center">
          <h1 className="text-lg">
            Visualization Studio is for project admins
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Published visualizations remain available in trace and session
            views.
          </p>
        </Card>
      </div>
    );
  }

  const sourceLabel = bindingLabel(definition.binding.source);
  const targetAudience = audienceSummary(browseFilters);
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
    if (isTraceSurface) return "Draft as a Trace detail tab";
    return "Draft injected into the Session";
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
          <Sparkles className="h-5 w-5" />
          <span>No visualization generated for this surface yet.</span>
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
  const generationButtonLabel = generateVersion.isPending
    ? "Generating…"
    : "Generate version";
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
  const rendererPicker = (
    <label className="flex min-w-40 flex-col gap-1">
      <span className="text-muted-foreground text-[10px] font-bold uppercase">
        Renderer
      </span>
      <Select
        value={rendererPreference}
        onValueChange={(value) =>
          setRendererPreference(value as RendererPreference)
        }
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Auto · best fit</SelectItem>
          <SelectItem value="template">Template</SelectItem>
          <SelectItem value="chart">Chart</SelectItem>
          <SelectItem value="react">Interactive</SelectItem>
          <SelectItem value="shader">Three / shader</SelectItem>
        </SelectContent>
      </Select>
    </label>
  );
  const generationPanel = !draftReady ? (
    <div className="bg-muted/15 border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="text-primary h-4 w-4" />
            Generate a visualization from this example
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Langfuse studies this example, representative filter matches, and
            relevant saved views to choose a useful story and renderer.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {rendererPicker}
          <Button
            className="h-9 shrink-0"
            onClick={handleAutoGenerate}
            disabled={
              !selectedObservation ||
              !generationModel.data ||
              generationContextPending ||
              generateVersion.isPending
            }
          >
            <WandSparkles className="mr-2 h-4 w-4" />
            {generateVersion.isPending
              ? "Generating visualization…"
              : "Generate visualization"}
          </Button>
        </div>
      </div>
      <div className="text-muted-foreground mt-1.5 text-[10px]">
        {generationModelLabel} · {generationContextLabel}
      </div>
    </div>
  ) : (
    <div className="bg-muted/15 border-b p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="text-primary h-4 w-4" />
        <div>
          <h2 className="text-sm font-bold">
            Describe what should change below
          </h2>
          <p className="text-muted-foreground text-xs">
            The next version uses bounded input/output samples from this filter
            and relevant saved views. Samples are sent to the configured project
            model.
          </p>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <Textarea
          className="ph-no-capture min-h-16 flex-1"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={2}
        />
        {rendererPicker}
        <Button
          className="h-9 shrink-0"
          onClick={handleGenerate}
          disabled={
            !selectedObservation ||
            !generationModel.data ||
            generationContextPending ||
            generateVersion.isPending
          }
        >
          <WandSparkles className="mr-2 h-4 w-4" />
          {generationButtonLabel}
        </Button>
      </div>
      <div className="text-muted-foreground mt-1.5 text-[10px]">
        {generationModelLabel} · {generationContextLabel}
      </div>
    </div>
  );

  return (
    <div className="bg-muted/15 flex min-h-full flex-col">
      <header className="bg-background sticky top-0 z-20 border-b px-5 py-3 md:px-8">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link href={`/project/${projectId}/visualizations`}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Back to visualizations</span>
              </Link>
            </Button>
            <div className="min-w-0">
              <h1
                className="truncate text-lg font-bold tracking-tight"
                title={
                  props.mode === "create"
                    ? "New visualization"
                    : "Edit visualization"
                }
              >
                {props.mode === "create"
                  ? "New visualization"
                  : "Edit visualization"}
              </h1>
              <p className="text-muted-foreground text-sm">
                Choose where it appears, then design it with a real example.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isDirty ? "secondary" : "outline"}>
              {draftStatus}
            </Badge>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={!draftReady || saveVersion.isPending}
            >
              <Save className="mr-2 h-4 w-4" /> Save version
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
              <Play className="mr-2 h-4 w-4" />
              {isLive ? "Live" : "Publish version"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1800px] gap-5 p-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:p-6">
        <aside className="min-h-0 xl:sticky xl:top-[86px] xl:h-[calc(100vh-108px)]">
          <Card className="flex h-full min-h-[520px] flex-col overflow-hidden p-4">
            <div className="mb-4">
              <div className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
                1 · Applies to
              </div>
              <h2 className="mt-1 text-base font-bold">{targetAudience}</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Filter the observations that should receive this visualization.
                Select any result to test it.
              </p>
              <div className="bg-muted/25 mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                <span className="font-bold">{targetAudience}</span>
                <ArrowRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                <span className="text-muted-foreground">{sourceLabel}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden [&>div]:h-full">
              <EvaluatorSampleObservationSelector
                projectId={projectId}
                timeRange={timeRange}
                selectedObservationId={selectedObservation?.id ?? null}
                filterState={browseFilters}
                onFilterStateChange={updateMatchFilters}
                onSelect={setSelectedObservation}
                onOpenTrace={openExampleContext}
                displayMode="compact-list"
              />
            </div>
          </Card>
        </aside>

        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    value={definition.title}
                    onChange={(event) =>
                      updateDefinition({
                        ...definition,
                        title: event.target.value,
                      })
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
                </div>
                <div className="text-muted-foreground bg-muted/20 max-w-xs rounded-lg border px-3 py-2 text-xs">
                  {selectedStoredVisualization?.activeVersion
                    ? `Live v${selectedStoredVisualization.activeVersion.version} stays unchanged while you edit.`
                    : "Nothing is visible to viewers until you publish a saved version."}
                </div>
              </div>
            </div>

            <div className="border-b p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-muted-foreground mb-1 text-[11px] font-bold tracking-wide uppercase">
                    2 · Appears in
                  </div>
                  <div className="text-sm font-bold">{sourceLabel}</div>
                  <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                    <span>Testing with</span>
                    <div className="flex items-center gap-2 text-sm font-bold">
                      {selectedObservation ? (
                        <ItemBadge
                          type={selectedObservation.type as LangfuseItemType}
                          isSmall
                        />
                      ) : null}
                      <span
                        className="truncate"
                        title={
                          selectedObservation?.name ?? "No example selected"
                        }
                      >
                        {selectedObservation?.name ?? "No example selected"}
                      </span>
                      {selectedObservation ? (
                        <span
                          className="text-muted-foreground truncate text-xs font-normal"
                          title={
                            selectedObservation.traceName ??
                            selectedObservation.traceId ??
                            undefined
                          }
                        >
                          in{" "}
                          {selectedObservation.traceName ??
                            selectedObservation.traceId}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="bg-muted/20 flex rounded-lg border p-1">
                  {(
                    [
                      ["OBSERVATION_INPUT", "Session · input"],
                      ["OBSERVATION_OUTPUT", "Session · output"],
                      ["TRACE", "Trace data"],
                    ] as const
                  ).map(([source, label]) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => updateSource(source)}
                      disabled={
                        source === "TRACE" &&
                        !canVisualizeTrace &&
                        definition.binding.source !== "TRACE"
                      }
                      title={
                        source === "TRACE" && !canVisualizeTrace
                          ? "Choose the Root spans example filter first"
                          : undefined
                      }
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                        definition.binding.source === source
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {!canVisualizeTrace && !isTraceSurface ? (
                <p className="text-muted-foreground mt-2 text-right text-[10px]">
                  Whole-trace views are available after filtering examples to
                  Root spans.
                </p>
              ) : null}
            </div>

            {generationPanel}

            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">Preview</div>
                  <div className="text-muted-foreground text-xs">
                    Both panes update from the selected example.
                  </div>
                </div>
                <div className="bg-muted/20 flex rounded-lg border p-1">
                  {(["compare", "default", "visualized"] as const).map(
                    (mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setComparisonMode(mode)}
                        className={`rounded-md px-3 py-1.5 text-xs capitalize transition-colors ${
                          comparisonMode === mode
                            ? "bg-background font-bold shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {mode}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div
                className={`grid gap-3 ${
                  comparisonMode === "compare"
                    ? "lg:grid-cols-2"
                    : "grid-cols-1"
                }`}
              >
                {comparisonMode !== "visualized" ? (
                  <section className="bg-background overflow-hidden rounded-xl border">
                    <div className="flex items-center justify-between border-b px-4 py-2.5">
                      <div>
                        <div className="text-xs font-bold">Default</div>
                        <div className="text-muted-foreground text-[11px]">
                          {defaultSurfaceDescription}
                        </div>
                      </div>
                      <Badge variant="outline">{sourceLabel}</Badge>
                    </div>
                    {defaultSurfacePreview}
                  </section>
                ) : null}

                {comparisonMode !== "default" ? (
                  <section className="ph-no-capture bg-background overflow-hidden rounded-xl border">
                    <div className="flex items-center justify-between border-b px-4 py-2.5">
                      <div>
                        <div className="text-xs font-bold">Visualized</div>
                        <div className="text-muted-foreground text-[11px]">
                          {visualizedSurfaceDescription}
                        </div>
                      </div>
                      <Badge variant="outline">
                        {rendererLabel(definition)}
                      </Badge>
                    </div>
                    {visualizedSurfacePreview}
                  </section>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="divide-y overflow-hidden">
            {selectedStoredVisualization ? (
              <details>
                <summary className="flex cursor-pointer list-none items-center justify-between p-4">
                  <span>
                    <span className="text-sm font-bold">Version history</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      Published versions stay unchanged while you create a new
                      one.
                    </span>
                  </span>
                  <Badge variant="outline">
                    {selectedStoredVisualization.versions.length}
                  </Badge>
                </summary>
                <div className="flex flex-wrap gap-2 border-t p-4">
                  {selectedStoredVisualization.versions.map((version) => {
                    const parsed = VisualizationDefinitionSchema.safeParse(
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
                  })}
                </div>
              </details>
            ) : null}

            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between p-4">
                <span>
                  <span className="text-sm font-bold">Renderer</span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    Choose the execution model for this draft.
                  </span>
                </span>
                <Badge variant="outline">{rendererLabel(definition)}</Badge>
              </summary>
              <div className="flex flex-wrap gap-2 border-t p-4">
                {(
                  [
                    ["template", Braces, "Template"],
                    ["chart", ChartNoAxesCombined, "Chart"],
                    ["react", Code2, "React lab"],
                    ["shader", FlaskConical, "Three / shader lab"],
                  ] as const
                ).map(([kind, Icon, label]) => (
                  <Button
                    key={kind}
                    type="button"
                    variant={
                      definition.renderer.kind === kind ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => applyRenderer(kind)}
                  >
                    <Icon className="mr-2 h-3.5 w-3.5" /> {label}
                  </Button>
                ))}
              </div>
            </details>

            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between p-4">
                <span>
                  <span className="text-sm font-bold">Edit definition</span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    Manually edit applicability, placement, binding, and
                    renderer.
                  </span>
                </span>
                <Badge variant="outline">Advanced</Badge>
              </summary>
              <div className="space-y-3 border-t p-4">
                <Textarea
                  className="ph-no-capture font-mono text-xs"
                  rows={24}
                  value={rawDefinition}
                  onChange={(event) => setRawDefinition(event.target.value)}
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      try {
                        const parsed = VisualizationDefinitionSchema.parse(
                          JSON.parse(rawDefinition),
                        );
                        setDefinition(parsed);
                        setBrowseFilters(parsed.match.filters);
                        toast.success("Definition applied to this draft");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Invalid definition",
                        );
                      }
                    }}
                  >
                    <Check className="mr-2 h-4 w-4" /> Apply definition
                  </Button>
                </div>
              </div>
            </details>
          </Card>
        </div>
      </main>
    </div>
  );
}
