import React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  Copy,
  Database,
  ExternalLink,
  Info,
  MessageSquare,
  MoreVertical,
  PencilLine,
  Plus,
  SquarePen,
  X,
} from "lucide-react";
import { deepParseJson, type FilterState } from "@langfuse/shared";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { BreakdownTooltip } from "@/src/components/trace/components/_shared/BreakdownToolTip";
import { CorrectedOutputField } from "@/src/components/trace/components/IOPreview/components/CorrectedOutputField";
import {
  useChatMLParser,
  type ChatMlMessage,
} from "@/src/components/trace/components/IOPreview/hooks/useChatMLParser";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { useSessionDetailStore } from "@/src/components/session/SessionDetailStoreProvider";
import { type SessionTraceObservation } from "@/src/components/session/SessionObservationIO";
import { CommentList } from "@/src/features/comments/CommentList";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterOutputs } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

type OpenPeek = (id: string, row: any) => void;

/** Rendered output is capped at this many lines until the user expands it. */
const OUTPUT_LINE_CAP = 10;

/** Short type labels for the header badge, per the inspector design. */
const OBSERVATION_TYPE_LABELS: Record<string, string> = {
  GENERATION: "GEN",
};

const observationTypeLabel = (type: string | null | undefined): string => {
  if (!type) return "SPAN";
  return OBSERVATION_TYPE_LABELS[type] ?? type;
};

const hasContent = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  !(typeof value === "string" && value.trim() === "");

/** Flattens a ChatML message's content into displayable text. */
const messageContentToText = (message: ChatMlMessage): string => {
  const content = message.content;
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return JSON.stringify(part, null, 2);
      })
      .join("\n");
  }
  return JSON.stringify(content, null, 2);
};

const rawValueToText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
};

/** Mono uppercase eyebrow label used across the inspector. */
const EyebrowLabel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={cn(
      "text-muted-foreground font-mono text-[9px] font-bold tracking-[0.08em] uppercase",
      className,
    )}
  >
    {children}
  </span>
);

/** 8px full-width band separating the inspector's visual zones. */
const ZoneDivider = () => <div className="bg-muted/60 h-2 border-y" />;

/**
 * Collapsible full-width row used for progressive disclosure inside the
 * Input zone (system prompt, tools not called).
 */
const CollapsibleRow = ({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="bg-muted/30 hover:bg-muted/60 flex w-full items-center gap-2 rounded-sm border px-3 py-2 text-left transition-colors"
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="flex-1" />
      <ChevronDown
        className={cn(
          "text-muted-foreground h-3.5 w-3.5 transition-transform",
          isOpen ? "rotate-180" : "rotate-0",
        )}
      />
    </button>
    {isOpen ? (
      <div className="bg-background rounded-sm border p-3">{children}</div>
    ) : null}
  </div>
);

/**
 * Mono content block capped at OUTPUT_LINE_CAP lines with a centered
 * "Show N more lines" control, per the inspector design.
 */
const LineCappedText = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [metrics, setMetrics] = React.useState<{
    lineHeight: number;
    totalLines: number;
  } | null>(null);

  const measureRef = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 18;
    const totalLines = Math.round(node.scrollHeight / lineHeight);
    setMetrics({ lineHeight, totalLines });
  }, []);

  const hiddenLines = metrics
    ? Math.max(0, metrics.totalLines - OUTPUT_LINE_CAP)
    : 0;
  const isCollapsed = !expanded && hiddenLines > 0;

  const toggleControl = (label: string, rotated: boolean) => (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 pt-2"
    >
      <span className="border-border flex-1 border-t" />
      <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
        {label}
        <ChevronDown
          className={cn("h-3 w-3", rotated ? "rotate-180" : "rotate-0")}
        />
      </span>
      <span className="border-border flex-1 border-t" />
    </button>
  );

  return (
    <div>
      <div
        ref={measureRef}
        className="overflow-hidden font-mono text-xs leading-relaxed break-words whitespace-pre-wrap"
        style={
          isCollapsed && metrics
            ? { maxHeight: metrics.lineHeight * OUTPUT_LINE_CAP }
            : undefined
        }
      >
        {text}
      </div>
      {isCollapsed
        ? toggleControl(`Show ${hiddenLines} more lines`, false)
        : null}
      {expanded && hiddenLines > 0 ? toggleControl("Show less", true) : null}
    </div>
  );
};

type OverviewRow = {
  label: string;
  value: React.ReactNode;
  title?: string;
};

/** Overview metrics grid: uppercase mono labels + mono values, 2 columns. */
const OverviewGrid = ({ rows }: { rows: OverviewRow[] }) => (
  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
    {rows.map((row) => (
      <React.Fragment key={row.label}>
        <EyebrowLabel>{row.label}</EyebrowLabel>
        <span
          className="min-w-0 truncate font-mono text-[11px] font-bold"
          title={row.title}
        >
          {row.value}
        </span>
      </React.Fragment>
    ))}
  </div>
);

const scoreValueLabel = (
  score: EventSessionTrace["scores"][number],
): string => {
  if (score.stringValue) return score.stringValue;
  if (score.value === null || score.value === undefined) return "—";
  return Number.isInteger(score.value)
    ? String(score.value)
    : score.value.toFixed(2);
};

/** Rounded neutral pill for a score value (categorical, numeric, boolean). */
const ScoreValuePill = ({ label }: { label: string }) => (
  <span
    className="bg-muted/50 text-foreground inline-flex max-w-40 truncate rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold"
    title={label}
  >
    {label}
  </span>
);

const ScoresSection = ({
  scores,
  onAddScore,
  hasAnnotationAccess,
}: {
  scores: EventSessionTrace["scores"];
  onAddScore: () => void;
  hasAnnotationAccess: boolean;
}) => {
  const [isOpen, setIsOpen] = React.useState(true);
  const peekScores = scores.slice(0, 2);
  const remaining = scores.length - peekScores.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 py-2.5"
      >
        <EyebrowLabel className="tracking-[0.1em]">Scores</EyebrowLabel>
        <span className="flex min-w-0 items-center gap-1.5">
          {!isOpen ? (
            <span className="flex min-w-0 items-center gap-1">
              {peekScores.map((score) => (
                <ScoreValuePill
                  key={score.id}
                  label={`${score.name}:${scoreValueLabel(score)}`}
                />
              ))}
              {remaining > 0 ? (
                <ScoreValuePill label={`+${remaining}`} />
              ) : null}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </span>
      </button>
      {isOpen ? (
        <div className="flex flex-col gap-1.5 pb-3">
          {scores.length > 0 ? (
            scores.map((score) => (
              <div
                key={score.id}
                className="flex items-center justify-between gap-2 rounded-sm border px-3 py-2"
              >
                <span className="min-w-0 truncate text-xs" title={score.name}>
                  {score.name}
                </span>
                <ScoreValuePill label={scoreValueLabel(score)} />
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">No scores yet</p>
          )}
          {hasAnnotationAccess ? (
            <button
              type="button"
              onClick={onAddScore}
              className="text-muted-foreground hover:text-foreground mt-1 self-start text-xs"
            >
              <span className="font-mono">+</span> Add score
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const MetadataSection = ({ metadata }: { metadata: unknown }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const entries: Array<[string, string]> =
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
      ? Object.entries(metadata as Record<string, unknown>).map(
          ([key, value]) => [
            key,
            typeof value === "string" ? value : JSON.stringify(value),
          ],
        )
      : hasContent(metadata)
        ? [["metadata", rawValueToText(metadata)]]
        : [];

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 py-2.5"
      >
        <EyebrowLabel className="tracking-[0.1em]">Metadata</EyebrowLabel>
        <span className="flex items-center gap-2">
          {!isOpen ? (
            <span className="text-muted-foreground font-mono text-[10px]">
              {entries.length} {entries.length === 1 ? "item" : "items"}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "text-muted-foreground h-3.5 w-3.5 transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </span>
      </button>
      {isOpen ? (
        entries.length > 0 ? (
          <div className="bg-background mb-3 flex flex-col gap-0.5 rounded-sm border p-3">
            {entries.map(([key, value]) => (
              <div
                key={key}
                className="truncate font-mono text-xs leading-relaxed"
                title={`${key}: ${value}`}
              >
                <span className="text-muted-foreground">{key}:</span>{" "}
                <span>{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground pb-3 text-xs">No metadata</p>
        )
      ) : null}
    </div>
  );
};

type InspectorOverlay = "dataset" | "annotate" | "comments" | null;

const InspectorContent = ({
  observation,
  trace,
  projectId,
  sessionId,
  openPeek,
  onClose,
  overlay,
  setOverlay,
}: {
  observation: SessionTraceObservation;
  trace: EventSessionTrace | undefined;
  projectId: string;
  sessionId: string;
  openPeek: OpenPeek;
  onClose: () => void;
  overlay: InspectorOverlay;
  setOverlay: (overlay: InspectorOverlay) => void;
}) => {
  const [systemPromptOpen, setSystemPromptOpen] = React.useState(false);
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [correctionOpen, setCorrectionOpen] = React.useState(false);

  const hasAnnotationAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });

  const parsed = React.useMemo(
    () => ({
      input: deepParseJson(observation.input, {
        maxSize: 300_000,
        maxDepth: 2,
      }),
      output: deepParseJson(observation.output, {
        maxSize: 300_000,
        maxDepth: 2,
      }),
      metadata: deepParseJson(observation.metadata, {
        maxSize: 100_000,
        maxDepth: 2,
      }),
    }),
    [observation.input, observation.output, observation.metadata],
  );

  const chatML = useChatMLParser(
    observation.input ?? undefined,
    observation.output ?? undefined,
    observation.metadata ?? undefined,
    observation.name ?? undefined,
    parsed.input,
    parsed.output,
    parsed.metadata,
  );

  const isChat = chatML.canDisplayAsChat;
  const inputMessages = isChat
    ? chatML.allMessages.slice(0, chatML.inputMessageCount)
    : [];
  const outputMessages = isChat
    ? chatML.allMessages.slice(chatML.inputMessageCount)
    : [];
  const systemMessages = inputMessages.filter(
    (message) => message.role === "system" || message.role === "developer",
  );
  const conversationInputMessages = inputMessages.filter(
    (message) => message.role !== "system" && message.role !== "developer",
  );
  const uncalledTools = chatML.allTools.filter(
    (tool) => (chatML.toolCallCounts.get(tool.name) ?? 0) === 0,
  );

  const inputText = isChat
    ? conversationInputMessages
        .map((message) => {
          const text = messageContentToText(message);
          return conversationInputMessages.length > 1
            ? `${(message.role ?? "message").toUpperCase()}\n${text}`
            : text;
        })
        .filter((text) => text.trim() !== "")
        .join("\n\n")
    : rawValueToText(parsed.input);
  const outputText = isChat
    ? outputMessages
        .map(messageContentToText)
        .filter((text) => text.trim() !== "")
        .join("\n\n")
    : rawValueToText(parsed.output);
  const systemPromptText = systemMessages
    .map(messageContentToText)
    .filter((text) => text.trim() !== "")
    .join("\n\n");

  // Correct + the darker badge are strictly GENERATION (per the design);
  // isGenerationLike is wider (AGENT, TOOL, ...) and would leak them.
  const isGeneration = observation.type === "GENERATION";
  const environment = observation.environment ?? trace?.environment;
  const userId = observation.userId ?? trace?.userId ?? null;

  const observationScores = React.useMemo(
    () =>
      (trace?.scores ?? []).filter(
        (score) => score.observationId === observation.id,
      ),
    [trace?.scores, observation.id],
  );
  const traceScores = React.useMemo(
    () => (trace?.scores ?? []).filter((score) => !score.observationId),
    [trace?.scores],
  );

  const overviewRows: OverviewRow[] = [];
  if (observation.latency !== null && observation.type !== "EVENT") {
    overviewRows.push({
      label: "Latency",
      value: formatIntervalSeconds(observation.latency),
    });
  }
  if (environment) {
    overviewRows.push({
      label: "Env",
      value: environment,
      title: environment,
    });
  }
  if (userId) {
    overviewRows.push({
      label: "User",
      title: userId,
      value: (
        <Link
          href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
          className="hover:text-primary inline-flex max-w-full items-center gap-0.5"
        >
          <span className="truncate" title={userId}>
            {userId}
          </span>
          <ArrowUpRight className="h-3 w-3 shrink-0" />
        </Link>
      ),
    });
  }
  overviewRows.push({
    label: "Session",
    title: sessionId,
    value: (
      <Link
        href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
        className="hover:text-primary inline-flex max-w-full items-center gap-0.5"
      >
        <span className="truncate" title={sessionId}>
          {sessionId}
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0" />
      </Link>
    ),
  });
  // A zero cost on non-generation types (tools, spans) is noise, not signal.
  if (
    observation.totalCost !== null &&
    (observation.totalCost > 0 || isGeneration)
  ) {
    overviewRows.push({
      label: "Cost",
      value: (
        <BreakdownTooltip
          details={observation.costDetails ?? {}}
          isCost
          pricingTierName={observation.usagePricingTierName ?? undefined}
        >
          <span className="inline-flex items-center gap-0.5">
            {usdFormatter(observation.totalCost)}
            <Info className="text-muted-foreground h-2.5 w-2.5" />
          </span>
        </BreakdownTooltip>
      ),
    });
  }
  if (observation.totalUsage > 0) {
    overviewRows.push({
      label: "Tokens",
      value: (
        <BreakdownTooltip
          details={observation.usageDetails ?? {}}
          pricingTierName={observation.usagePricingTierName ?? undefined}
        >
          <span className="inline-flex items-center gap-0.5">
            {compactNumberFormatter(observation.inputUsage)}→
            {compactNumberFormatter(observation.outputUsage)}
            <Info className="text-muted-foreground h-2.5 w-2.5" />
          </span>
        </BreakdownTooltip>
      ),
    });
  }
  if (observation.model) {
    overviewRows.push({
      label: "Model",
      value: observation.model,
      title: observation.model,
    });
  }

  const openInTraceView = () => {
    if (!trace) return;
    openPeek(trace.id, { ...trace, observationId: observation.id });
  };

  return (
    <>
      {/* Header — sticky above the scrolling zones */}
      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-3">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide uppercase",
              isGeneration
                ? "bg-muted text-foreground"
                : "bg-muted/40 text-muted-foreground",
            )}
          >
            {observationTypeLabel(observation.type)}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-bold"
              title={observation.name ?? observation.id}
            >
              {observation.name ?? observation.id}
            </div>
            <LocalIsoDate
              date={observation.startTime}
              accuracy="millisecond"
              className="text-muted-foreground font-mono text-[10px]"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2.5">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add to
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!hasDatasetAccess}
                  onClick={() => setOverlay("dataset")}
                >
                  <Database className="mr-2 h-3.5 w-3.5" />
                  Add to dataset
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasAnnotationAccess}
                  onClick={() => setOverlay("annotate")}
                >
                  <SquarePen className="mr-2 h-3.5 w-3.5" />
                  Annotate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOverlay("comments")}>
                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                  Add comment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openInTraceView} disabled={!trace}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Open in trace view
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => copyTextToClipboard(observation.id)}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy observation ID
                </DropdownMenuItem>
                {trace ? (
                  <DropdownMenuItem
                    onClick={() => copyTextToClipboard(trace.id)}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Copy trace ID
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Close inspector"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {overviewRows.length > 0 ? <OverviewGrid rows={overviewRows} /> : null}
      </div>

      {/* Scrolling zones */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ZoneDivider />
        <div className="flex flex-col gap-4 px-4 py-4">
          {hasContent(inputText) ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold">Input</span>
              <div className="bg-muted/30 rounded-sm border p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                {inputText}
              </div>
            </div>
          ) : null}
          {systemPromptText ? (
            <CollapsibleRow
              label="System prompt"
              isOpen={systemPromptOpen}
              onToggle={() => setSystemPromptOpen((current) => !current)}
            >
              <div className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                {systemPromptText}
              </div>
            </CollapsibleRow>
          ) : null}
          {uncalledTools.length > 0 ? (
            <CollapsibleRow
              label={`${uncalledTools.length} available tool${uncalledTools.length === 1 ? "" : "s"} not called`}
              isOpen={toolsOpen}
              onToggle={() => setToolsOpen((current) => !current)}
            >
              <div className="flex flex-col gap-0.5">
                {uncalledTools.map((tool) => (
                  <span
                    key={tool.name}
                    className="truncate font-mono text-xs leading-relaxed"
                    title={tool.name}
                  >
                    {tool.name}
                  </span>
                ))}
              </div>
            </CollapsibleRow>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold">Output</span>
              {isGeneration && hasAnnotationAccess && trace ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground h-6 px-2 text-[11px]"
                  onClick={() => setCorrectionOpen((current) => !current)}
                >
                  <PencilLine className="mr-1 h-3 w-3" />
                  Correct
                </Button>
              ) : null}
            </div>
            {hasContent(outputText) ? (
              <div className="bg-muted/30 rounded-sm border p-3">
                <LineCappedText text={outputText} />
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">No output</p>
            )}
            {correctionOpen && trace ? (
              <CorrectedOutputField
                projectId={projectId}
                traceId={trace.id}
                environment={environment ?? "default"}
                actualOutput={parsed.output}
                observationId={observation.id}
              />
            ) : null}
          </div>
        </div>
        <ZoneDivider />
        <div className="px-4 pt-1 pb-4">
          <ScoresSection
            scores={observationScores}
            onAddScore={() => setOverlay("annotate")}
            hasAnnotationAccess={hasAnnotationAccess}
          />
          <div className="border-t" />
          <MetadataSection metadata={parsed.metadata} />
        </div>
      </div>

      {/* Overlays opened from the menus — siblings, per the overlay
          lifecycle rule (the dropdown closes before these mount). */}
      <Dialog
        open={overlay === "dataset"}
        onOpenChange={(open) => setOverlay(open ? "dataset" : null)}
      >
        <DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none">
          <DialogHeader>
            <DialogTitle>Add item to datasets</DialogTitle>
          </DialogHeader>
          {overlay === "dataset" && trace ? (
            <NewDatasetItemForm
              traceId={trace.id}
              observationId={observation.id}
              projectId={projectId}
              input={parsed.input as never}
              output={parsed.output as never}
              metadata={observation.metadata}
              onFormSuccess={() => setOverlay(null)}
              className="h-full overflow-y-auto"
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Drawer
        open={overlay === "annotate"}
        onOpenChange={(open) => setOverlay(open ? "annotate" : null)}
      >
        <DrawerContent className="p-3">
          {overlay === "annotate" && trace ? (
            <DualAnnotationContent
              projectId={projectId}
              traceId={trace.id}
              observationId={observation.id}
              traceEnvironment={trace.environment ?? "default"}
              observationEnvironment={observation.environment}
              observationScores={observationScores}
              traceScores={traceScores}
            />
          ) : null}
        </DrawerContent>
      </Drawer>
      <Drawer
        open={overlay === "comments"}
        onOpenChange={(open) => setOverlay(open ? "comments" : null)}
      >
        <DrawerContent className="p-3">
          <DrawerHeader className="p-0 pb-2">
            <DrawerTitle>Comments</DrawerTitle>
          </DrawerHeader>
          {overlay === "comments" ? (
            <CommentList
              projectId={projectId}
              objectId={observation.id}
              objectType="OBSERVATION"
              isDrawerOpen
            />
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
};

/**
 * Right-hand observation inspector for the Modern Session view.
 *
 * Slides in over the conversation feed when an observation is selected
 * (no scrim — a transparent click-catcher closes it, as does Esc or ✕).
 * Shows the selected observation's overview metrics, I/O, scores, and
 * metadata without leaving the session.
 */
export function ObservationInspector({
  projectId,
  sessionId,
  traces,
  filterState,
  openPeek,
}: {
  projectId: string;
  sessionId: string;
  traces: EventSessionTrace[];
  filterState: FilterState;
  openPeek: OpenPeek;
}) {
  const inspected = useSessionDetailStore(
    (state) => state.inspectedObservation,
  );
  const closeInspector = useSessionDetailStore(
    (state) => state.actions.closeInspector,
  );
  const [overlay, setOverlay] = React.useState<InspectorOverlay>(null);

  const isOpen = inspected !== null;

  // Esc-to-close (window is the external system). Skipped while a child
  // overlay is open — Radix handles Esc for the overlay itself.
  React.useEffect(() => {
    if (!isOpen || overlay !== null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeInspector();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, overlay, closeInspector]);

  const observationsQuery =
    api.sessions.observationsForTraceFromEvents.useQuery(
      {
        projectId,
        sessionId,
        traceId: inspected?.traceId ?? "",
        filter: filterState,
      },
      {
        enabled: inspected !== null,
        trpc: { context: { skipBatch: true } },
        staleTime: 60 * 1000,
      },
    );

  if (!inspected) return null;

  // Defensive against both response shapes (see TraceEventsRow, LFE-10958).
  type ObservationsResponse =
    RouterOutputs["sessions"]["observationsForTraceFromEvents"];
  const observationsData = observationsQuery.data as
    | ObservationsResponse
    | { observations?: ObservationsResponse }
    | undefined;
  const observations = Array.isArray(observationsData)
    ? observationsData
    : (observationsData?.observations ?? undefined);
  const observation = observations?.find(
    (candidate) => candidate.id === inspected.observationId,
  );
  const trace = traces.find((candidate) => candidate.id === inspected.traceId);

  return (
    <>
      {/* Transparent click-catcher — no scrim, clicking outside closes. */}
      <div
        aria-hidden
        className="absolute inset-0 z-10"
        onClick={closeInspector}
      />
      <aside
        aria-label="Observation details"
        className="bg-background animate-in slide-in-from-right absolute inset-y-0 right-0 z-20 flex w-[420px] max-w-full flex-col border-l shadow-[-10px_0_28px_hsl(var(--foreground)/0.09)] duration-200 dark:shadow-none"
      >
        {observationsQuery.isLoading ? (
          <div className="p-4">
            <JsonSkeleton className="h-full w-full" numRows={10} />
          </div>
        ) : observation ? (
          <InspectorContent
            key={observation.id}
            observation={observation}
            trace={trace}
            projectId={projectId}
            sessionId={sessionId}
            openPeek={openPeek}
            onClose={closeInspector}
            overlay={overlay}
            setOverlay={setOverlay}
          />
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Observation</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Close inspector"
                onClick={closeInspector}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              This observation is not part of the current view. It may be hidden
              by the active filter.
            </p>
            {trace ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  openPeek(trace.id, {
                    ...trace,
                    observationId: inspected.observationId,
                  })
                }
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open in trace view
              </Button>
            ) : null}
          </div>
        )}
      </aside>
    </>
  );
}
