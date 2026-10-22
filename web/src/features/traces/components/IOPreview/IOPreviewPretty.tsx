/* eslint-disable no-nested-ternary */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ObservationType,
  type Prisma,
  type ScoreDomain,
  type SkillsAvailable,
  type SkillsResourceLoaded,
  deepParseJson,
} from "@langfuse/shared";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { IOSection, type IOSectionAction } from "@/src/components/ui/IOSection";
import { FileCode2, FileText } from "@langfuse/icons";
import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { type MediaReturnType } from "@/src/features/media";
import { type ChatMLParserResult } from "../../hooks/useChatMLParser";
import {
  hasRenderableChatMessages,
  useIOPreviewParser,
} from "../../hooks/useIOPreviewParser";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { ChatMessageList } from "../ChatMessageList";
import useSessionStorage from "@/src/components/useSessionStorage";
import {
  ToolCallDefinitionCard,
  type ToolDefinition,
} from "./components/ToolCallDefinitionCard";
import {
  type ExpansionStateProps,
  type IOPreviewContentMode,
} from "./IOPreview";
import {
  CorrectedOutputField,
  useCorrectOutputAction,
} from "./components/CorrectedOutputField";
import { useCorrectionData } from "./hooks/useCorrectionData";
import { shouldRenderMessageForContentMode } from "@/src/features/traces/fns/chatMessageUtils";
import { StatusMessageSection } from "./components/StatusMessageSection";
import type { ObservationStatusMessage } from "./components/statusMessagePresentation";

const TOOLS_COLLAPSE_THRESHOLD = 5;
// The user's collapse choice lasts the session, across observations.
const TOOLS_COLLAPSED_KEY = "toolsSectionCollapsed";

interface JsonInputOutputViewProps {
  parsedInput: unknown;
  parsedOutput: unknown;
  isLoading: boolean;
  isParsing?: boolean;
  media?: MediaReturnType[];
  hideIfNull: boolean;
  hideInput: boolean;
  hideOutput: boolean;
  inputExpansionState?: Record<string, boolean> | boolean;
  outputExpansionState?: Record<string, boolean> | boolean;
  onInputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onOutputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  /** Extra header controls on the Output section. */
  outputActions?: IOSectionAction[];
}

function JsonInputOutputView({
  parsedInput,
  parsedOutput,
  isLoading,
  isParsing,
  media,
  hideIfNull,
  hideInput,
  hideOutput,
  inputExpansionState,
  outputExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
  outputActions,
}: JsonInputOutputViewProps) {
  const showInput = !hideInput && !(hideIfNull && !parsedInput);
  const showOutput = !hideOutput && !(hideIfNull && !parsedOutput);

  return (
    <div className="space-y-2">
      {showInput && (
        <PrettyJsonView
          title="Input"
          json={parsedInput}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "input") ?? []}
          currentView="pretty"
          externalExpansionState={inputExpansionState}
          onExternalExpansionChange={onInputExpansionChange}
        />
      )}
      {showOutput && (
        <PrettyJsonView
          title="Output"
          json={parsedOutput}
          isLoading={isLoading}
          isParsing={isParsing}
          media={media?.filter((m) => m.field === "output") ?? []}
          currentView="pretty"
          actions={outputActions}
          externalExpansionState={outputExpansionState}
          onExternalExpansionChange={onOutputExpansionChange}
        />
      )}
    </div>
  );
}

export interface IOPreviewPrettyProps extends ExpansionStateProps {
  skills?:
    | { kind: "available"; items: SkillsAvailable }
    | { kind: "loaded"; items: SkillsResourceLoaded };
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  status?: ObservationStatusMessage;
  metadata?: Prisma.JsonValue;
  outputCorrection?: ScoreDomain;
  // Pre-parsed data (optional, from useParsedObservation hook for performance)
  parsedInput?: unknown;
  parsedOutput?: unknown;
  parsedMetadata?: unknown;
  chatMLParserResult?: ChatMLParserResult;
  isLoading?: boolean;
  isParsing?: boolean;
  hideIfNull?: boolean;
  media?: MediaReturnType[];
  hideOutput?: boolean;
  hideInput?: boolean;
  observationId?: string;
  observationType?: ObservationType;
  projectId: string;
  traceId: string;
  environment?: string;
  showCorrections?: boolean;
  contentMode?: IOPreviewContentMode;
  showSystemPrompt?: boolean;
}

/**
 * IOPreviewPretty - Renders input/output in pretty view mode.
 *
 * Features:
 * - ChatML message format detection and rendering
 * - Tool definitions and invocations display
 * - Large content safety (markdown rendering limit)
 * - Accepts pre-parsed data to avoid duplicate parsing
 *
 * This component selects and renders the pretty-view parser output. For JSON
 * view, use IOPreviewJSON instead.
 */
export function IOPreviewPretty({
  skills,
  input,
  output,
  status,
  metadata,
  outputCorrection,
  parsedInput: preParsedInput,
  parsedOutput: preParsedOutput,
  parsedMetadata: preParsedMetadata,
  chatMLParserResult,
  isLoading = false,
  isParsing = false,
  hideIfNull = false,
  hideOutput = false,
  hideInput = false,
  media,
  inputExpansionState,
  outputExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
  observationId,
  observationType,
  projectId,
  traceId,
  environment = "default",
  showCorrections = true,
  contentMode = "all",
  showSystemPrompt,
}: IOPreviewPrettyProps) {
  const [isSkillsExpanded, setSkillsExpanded] = useState(false);
  const [expandedSkillKey, setExpandedSkillKey] = useState("");
  const [activeToolTab, setActiveToolTab] = useState<"called" | "not-called">(
    "called",
  );
  const [storedToolsCollapsed, setStoredToolsCollapsed] = useSessionStorage<
    boolean | null
  >(TOOLS_COLLAPSED_KEY, null);
  const skillGroups = new Map<
    string,
    {
      key: string;
      skill: SkillsAvailable[number];
      files: Set<string>;
    }
  >();
  const skillItems =
    skills?.kind === "loaded"
      ? skills.items.map((skill) => ({ skill, filePath: skill.filePath }))
      : (skills?.items ?? []).map((skill) => ({ skill, filePath: undefined }));
  for (const { skill, filePath } of skillItems) {
    const key = JSON.stringify([
      skill.langfuseSkillId ?? null,
      skill.skillName,
      skill.skillVersion ?? null,
    ]);
    const group = skillGroups.get(key) ?? {
      key,
      skill,
      files: new Set<string>(),
    };
    skillGroups.set(key, group);
    if (filePath !== undefined) group.files.add(filePath);
  }

  // Use pre-parsed data if available (from useParsedObservation hook),
  // otherwise parse with size/depth limits to prevent UI freeze
  // IMPORTANT: Don't parse while isParsing=true to avoid double-parsing with different object references
  const parsedInput = isParsing
    ? undefined // Wait for Web Worker to finish
    : (preParsedInput ??
      deepParseJson(input, { maxSize: 300_000, maxDepth: 2 }));
  const parsedOutput = isParsing
    ? undefined
    : (preParsedOutput ??
      deepParseJson(output, { maxSize: 300_000, maxDepth: 2 }));
  const parsedMetadata = isParsing
    ? undefined
    : (preParsedMetadata ??
      deepParseJson(metadata, { maxSize: 100_000, maxDepth: 2 }));

  // Parse into the shared preview contract.
  const parserResult = useIOPreviewParser(
    input,
    output,
    metadata,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    chatMLParserResult,
  );

  const shouldRenderMessages = hasRenderableChatMessages(parserResult);

  useIOParserComparisonCapture({
    input,
    output,
    chatMLParserResult,
    isLoading,
    isParsing,
    observationId,
    traceId,
    shouldRenderMessages,
  });

  const {
    allMessages,
    additionalInput,
    allTools,
    toolCallCounts,
    toolCallsByName,
    messageToToolCallNumbers,
    inputMessageCount,
  } = parserResult;

  const { calledTools, notCalledTools } = useMemo(
    () =>
      allTools.reduce(
        (groups, tool) => {
          if ((toolCallCounts.get(tool.name) ?? 0) > 0) {
            groups.calledTools.push(tool);
          } else {
            groups.notCalledTools.push(tool);
          }
          return groups;
        },
        {
          calledTools: [] as ToolDefinition[],
          notCalledTools: [] as ToolDefinition[],
        },
      ),
    [allTools, toolCallCounts],
  );
  const hasToolTabs = calledTools.length > 0 && notCalledTools.length > 0;
  const tabTools = activeToolTab === "called" ? calledTools : notCalledTools;
  const visibleTools = hasToolTabs ? tabTools : allTools;

  const characterLimit = useMarkdownRenderCharacterLimit();

  // Determine if markdown is safe to render (content size check)
  const shouldRenderMarkdown = useMemo(() => {
    // Fast byte estimation without expensive JSON.stringify
    // Estimate: count string lengths + rough object overhead
    const estimateSize = (obj: unknown): number => {
      if (obj === null || obj === undefined) return 4; // "null" or "undefined"
      if (typeof obj === "string") return obj.length;
      if (typeof obj === "number") return obj.toString().length;
      if (typeof obj === "boolean") return obj ? 4 : 5; // "true" or "false"

      if (Array.isArray(obj)) {
        // Rough estimate: sum of elements + commas + brackets
        return obj.reduce((sum, item) => sum + estimateSize(item) + 1, 2);
      }

      if (typeof obj === "object") {
        // Rough estimate: keys + values + colons + commas + braces
        return Object.entries(obj).reduce(
          (sum, [key, value]) => sum + key.length + estimateSize(value) + 3, // 3 for ":", "," and quotes
          2, // 2 for opening and closing braces
        );
      }

      return 0;
    };

    const inputSize = estimateSize(parsedInput);
    const outputSize = estimateSize(parsedOutput);
    const messagesSize = estimateSize(allMessages);
    const totalSize = inputSize + outputSize + messagesSize;

    const shouldRender = totalSize <= characterLimit;

    return shouldRender;
  }, [parsedInput, parsedOutput, allMessages, characterLimit]);

  // Prepare additional input (only if non-empty)
  const additionalInputToShow = useMemo(() => {
    if (!additionalInput || Object.keys(additionalInput).length === 0) {
      return undefined;
    }
    return additionalInput;
  }, [additionalInput]);

  // Shared props for JsonInputOutputView
  const jsonViewProps = {
    parsedInput,
    parsedOutput,
    isLoading,
    isParsing,
    media,
    hideIfNull,
    hideInput,
    hideOutput,
    inputExpansionState,
    outputExpansionState,
    onInputExpansionChange,
    onOutputExpansionChange,
  };

  const showData = contentMode !== "conversation";
  // The "Correct output" pencil lives in the Output header; the field below
  // opens into its editor from there. Without an Output header (no output
  // message rendered) the field keeps its own inline trigger.
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const correctOutputAction = useCorrectOutputAction({
    projectId,
    onOpen: () => setCorrectionOpen(true),
  });
  const { effectiveCorrection } = useCorrectionData(
    outputCorrection,
    observationId,
    traceId,
  );
  const hasOutputHeader = shouldRenderMessages
    ? allMessages.some(
        (message, index) =>
          index >= (inputMessageCount ?? 0) &&
          shouldRenderMessageForContentMode(
            message,
            contentMode,
            showSystemPrompt,
          ),
      )
    : !hideOutput && !(hideIfNull && !parsedOutput);
  const correctionTrigger = hasOutputHeader ? "header" : "inline";
  const outputActions =
    showCorrections &&
    hasOutputHeader &&
    !correctionOpen &&
    !effectiveCorrection
      ? [correctOutputAction]
      : undefined;
  // In header mode the field mounts only while open or with a correction.
  const showCorrectionField =
    showCorrections &&
    (correctionTrigger === "inline" || correctionOpen || !!effectiveCorrection);
  const correctedOutputField = showCorrectionField ? (
    <CorrectedOutputField
      actualOutput={parsedOutput}
      existingCorrection={outputCorrection}
      observationId={observationId}
      projectId={projectId}
      traceId={traceId}
      environment={environment}
      trigger={correctionTrigger}
      startEditing={correctionOpen && !effectiveCorrection}
      onClosed={() => setCorrectionOpen(false)}
    />
  ) : null;
  // Only generations hold a conversation; tools, spans, agents and the rest
  // are titled Input / Output rather than by role. (`isGenerationLike` is
  // wider: it also covers TOOL and AGENT, which carry model usage, not chat.)
  const titleBySide =
    observationType !== undefined && observationType !== "GENERATION";

  return (
    <div className="space-y-2 pt-3">
      {showData && status ? (
        <StatusMessageSection status={status} currentView="pretty" />
      ) : null}

      {showData && allTools.length > 0 ? (
        <IOSection
          title="Tools"
          variant="table"
          collapsed={
            storedToolsCollapsed ?? allTools.length > TOOLS_COLLAPSE_THRESHOLD
          }
          onCollapsedChange={setStoredToolsCollapsed}
          tabs={
            hasToolTabs
              ? {
                  value: activeToolTab,
                  onValueChange: (value) => {
                    if (value === "called" || value === "not-called")
                      setActiveToolTab(value);
                  },
                  items: [
                    {
                      value: "called",
                      label: "Called",
                      count: calledTools.length,
                    },
                    {
                      value: "not-called",
                      label: "Not called",
                      count: notCalledTools.length,
                    },
                  ],
                }
              : undefined
          }
        >
          <ToolCallDefinitionCard
            key={activeToolTab}
            tools={visibleTools}
            toolCallsByName={toolCallsByName}
          />
        </IOSection>
      ) : null}

      {showData && skills && skills.items.length > 0 ? (
        <IOSection title="Skills" count={skillGroups.size}>
          <Collapsible
            open={isSkillsExpanded}
            onOpenChange={setSkillsExpanded}
            className="flex flex-col gap-2"
          >
            <CollapsibleTrigger className="hover:bg-muted/20 flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left text-sm font-bold">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <FileCode2 size="base" color="muted" aria-hidden />
                <span>
                  {skillGroups.size}{" "}
                  {skills.kind === "available" ? "available" : "loaded"}{" "}
                  {skillGroups.size === 1 ? "skill" : "skills"}
                </span>
              </span>
              <Badge
                color="filled"
                size="sm"
                text={isSkillsExpanded ? "hide" : "show"}
              />
              <DropdownIndicator
                direction={isSkillsExpanded ? "down" : "right"}
              />
            </CollapsibleTrigger>
            <CollapsibleContent asChild>
              <ul className="flex flex-col gap-2">
                {Array.from(skillGroups.values(), ({ key, skill, files }) => (
                  <Collapsible
                    key={key}
                    asChild
                    open={expandedSkillKey === key}
                    onOpenChange={(open) =>
                      setExpandedSkillKey(open ? key : "")
                    }
                  >
                    <li className="min-w-0 overflow-hidden rounded-sm border">
                      <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                        <FileCode2 size="base" color="muted" aria-hidden />
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                          {skill.langfuseSkillId &&
                          skill.skillVersion != null ? (
                            <LinkBadge
                              href={`/project/${projectId}/skills/${encodeURIComponent(skill.skillName)}?version=${skill.skillVersion}`}
                              text={skill.skillName}
                              newTab
                              noCapture
                            />
                          ) : (
                            <Badge
                              color="ghost"
                              font="mono"
                              text={skill.skillName}
                            />
                          )}
                          {skill.skillVersion != null ? (
                            <Badge
                              color="filled"
                              size="sm"
                              text={`v${skill.skillVersion}`}
                            />
                          ) : null}
                        </div>
                        {files.size > 0 ? (
                          <CollapsibleTrigger
                            className="hover:bg-muted/20 flex shrink-0 items-center gap-1.5 rounded-sm px-1 py-0.5"
                            aria-label={`Files loaded for ${skill.skillName}`}
                          >
                            <Badge
                              color="green"
                              size="sm"
                              text={`${files.size} ${files.size === 1 ? "file" : "files"}`}
                            />
                            <DropdownIndicator
                              direction={
                                expandedSkillKey === key ? "down" : "right"
                              }
                            />
                          </CollapsibleTrigger>
                        ) : null}
                      </div>
                      {files.size > 0 ? (
                        <CollapsibleContent asChild>
                          <ul className="bg-muted/30 flex flex-col gap-2 border-t px-3 py-3">
                            {Array.from(files, (filePath) => (
                              <li
                                key={filePath}
                                className="flex min-w-0 items-start gap-2"
                              >
                                <FileText
                                  size="base"
                                  color="muted"
                                  __rawClassName="mt-0.5"
                                  aria-hidden
                                />
                                <span className="min-w-0 font-mono text-xs leading-relaxed break-all">
                                  {filePath}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </CollapsibleContent>
                      ) : null}
                    </li>
                  </Collapsible>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </IOSection>
      ) : null}

      {shouldRenderMessages ? (
        <div>
          <ChatMessageList
            messages={allMessages}
            shouldRenderMarkdown={shouldRenderMarkdown}
            additionalInput={additionalInputToShow}
            media={media ?? []}
            currentView="pretty"
            messageToToolCallNumbers={messageToToolCallNumbers}
            inputMessageCount={inputMessageCount}
            contentMode={contentMode}
            showSystemPrompt={showSystemPrompt}
            titleBySide={titleBySide}
            outputActions={outputActions}
          />
          {correctedOutputField}
        </div>
      ) : showData ? (
        <div>
          <JsonInputOutputView
            {...jsonViewProps}
            outputActions={outputActions}
          />
          {correctedOutputField}
        </div>
      ) : null}
    </div>
  );
}

/** Captures the normalization result for each displayed record. */
function useIOParserComparisonCapture({
  input,
  output,
  chatMLParserResult,
  isLoading,
  isParsing,
  observationId,
  traceId,
  shouldRenderMessages,
}: Pick<
  IOPreviewPrettyProps,
  | "input"
  | "output"
  | "chatMLParserResult"
  | "isLoading"
  | "isParsing"
  | "observationId"
  | "traceId"
> & { shouldRenderMessages: boolean }) {
  const capture = usePostHogClientCapture();
  const capturedNormalizationRecord = useRef<string | undefined>(undefined);

  /** Empty payloads are excluded from the normalization success metric. */
  const hasPayloadToNormalize =
    (input !== null && input !== undefined) ||
    (output !== null && output !== undefined);

  useEffect(() => {
    if (
      chatMLParserResult !== undefined ||
      !hasPayloadToNormalize ||
      isLoading ||
      isParsing
    ) {
      return;
    }

    const recordKey = `${observationId ? "observation" : "trace"}:${observationId ?? traceId}`;
    if (capturedNormalizationRecord.current === recordKey) return;

    capturedNormalizationRecord.current = recordKey;
    capture("trace_detail:io_parser_comparison", {
      isNormalizedSuccess: shouldRenderMessages,
    });
  }, [
    capture,
    chatMLParserResult,
    hasPayloadToNormalize,
    isLoading,
    isParsing,
    observationId,
    shouldRenderMessages,
    traceId,
  ]);
}
