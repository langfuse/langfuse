/* eslint-disable no-nested-ternary */
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ObservationType,
  type Prisma,
  type ScoreDomain,
  type SkillsAvailable,
  type SkillsResourceLoaded,
  deepParseJson,
} from "@langfuse/shared";
import { IOPreviewSection } from "./components/IOPreviewSection/IOPreviewSection";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useCorrectionMutations } from "./hooks/useCorrectionMutations";
import { useCorrectionEditor } from "./hooks/useCorrectionEditor";
import { CorrectedOutputDiffDialog } from "./components/CorrectedOutputDiffDialog";
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  X,
  ChevronUp,
  WrapText,
  Minus,
  Copy,
  Pencil,
  Trash,
  FileDiff,
} from "@langfuse/icons";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { canRenderContentAsMarkdown } from "@/src/components/ui/MarkdownJsonView";
import { type MediaReturnType } from "@/src/features/media";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePreserveRelativeScroll } from "../../hooks/usePreserveRelativeScroll";
import { ViewModeToggle, type ViewMode } from "./components/ViewModeToggle";
import {
  DEFAULT_JSON_VIEW_PREFERENCE,
  JSON_VIEW_PREFERENCE_STORAGE_KEY,
  normalizeJsonViewPreference,
} from "@/src/components/ui/jsonViewPreference";
import { Button } from "@/src/components/ui/button";
import { ActionButton } from "@/src/components/ActionButton";
import { useTheme } from "next-themes";
import { Command, CommandInput } from "@/src/components/ui/command";
import {
  MultiSectionJsonViewer,
  type MultiSectionJsonViewerHandle,
} from "../AdvancedJsonViewer/MultiSectionJsonViewer";
import { countJsonRows } from "../AdvancedJsonViewer/utils/rowCount";
import { useJsonViewPreferences } from "../AdvancedJsonViewer/hooks/useJsonViewPreferences";
import { LazyJsonViewer } from "../AdvancedJsonViewer/lazy/react/LazyJsonViewer";
import { type ExpansionState } from "../AdvancedJsonViewer/types";
import { type CommentedPathsByField } from "../AdvancedJsonViewer/utils/commentRanges";
import {
  InlineCommentSelectionProvider,
  useInlineCommentSelectionOptional,
  type SelectionData,
} from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { CommentableJsonView } from "@/src/features/comments/components/CommentableJsonView";
import { InlineCommentBubble } from "@/src/features/comments/components/InlineCommentBubble";
import {
  decodeUnicodeInJson,
  DECODE_UNICODE_MAX_NODES,
} from "@/src/utils/decodeUnicodeInJson";
import { LargeJsonFieldFallback } from "./components/LargeJsonFieldFallback";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  JSON_VIEW_RENDER_ROW_LIMIT,
  probeJsonField,
} from "./fns/jsonViewSizeGate";
import { type ChatMLParserResult } from "../../hooks/useChatMLParser";
import {
  hasRenderableChatMessages,
  useIOPreviewParser,
} from "../../hooks/useIOPreviewParser";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  filterAlreadyRenderedMedia,
  getRenderedInlineMediaIds,
} from "@/src/components/ui/markdown-media.utils";
import useSessionStorage from "@/src/components/useSessionStorage";
import { type ToolDefinition } from "./components/ToolCallDefinitionCard";
import { useCorrectionData } from "./hooks/useCorrectionData";
import {
  getMessageTitle,
  shouldRenderMessageForContentMode,
} from "@/src/features/traces/fns/chatMessageUtils";
import {
  getStatusMessagePresentation,
  parseStructuredStatusMessage,
  type ObservationStatusMessage,
} from "./components/statusMessagePresentation";

export type { ViewMode };
export type IOPreviewContentMode = "all" | "conversation";

type CorrectionSectionProps = Extract<
  React.ComponentProps<typeof IOPreviewSection>,
  { kind: "correction" }
>;

export interface ExpansionStateProps {
  inputExpansionState?: Record<string, boolean> | boolean;
  outputExpansionState?: Record<string, boolean> | boolean;
  metadataExpansionState?: Record<string, boolean> | boolean;
  onInputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onOutputExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  onMetadataExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
  advancedJsonExpansionState?: ExpansionState;
  onAdvancedJsonExpansionChange?: (expansion: Record<string, boolean>) => void;
  jsonInputExpanded?: boolean;
  jsonOutputExpanded?: boolean;
  jsonMetadataExpanded?: boolean;
  onJsonInputExpandedChange?: (expanded: boolean) => void;
  onJsonOutputExpandedChange?: (expanded: boolean) => void;
  onJsonMetadataExpandedChange?: (expanded: boolean) => void;
}

const TOOLS_COLLAPSE_THRESHOLD = 5;
// The user's collapse choice lasts the session, across observations.
const TOOLS_COLLAPSED_KEY = "toolsSectionCollapsed";
const EXPANDED_TAIL_LENGTH = 3;
const FOLD_ABOVE_MESSAGES = 6;

interface IOPreviewContentProps extends ExpansionStateProps {
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
  hideMetadata?: boolean;
  enableInlineComments?: boolean;
  onAddInlineComment?: (selection: SelectionData) => void;
  commentedPathsByField?: CommentedPathsByField;
  onVirtualizationChange?: (isVirtualized: boolean) => void;
}

export interface IOPreviewProps extends IOPreviewContentProps {
  currentView?: ViewMode;
  observationName?: string;
  setIsPrettyViewAvailable?: (value: boolean) => void;
}

/** Owns view selection and the shared I/O sections; inactive renderers unmount. */
export function IOPreview({
  currentView,
  observationName,
  setIsPrettyViewAvailable,
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
  metadataExpansionState,
  onMetadataExpansionChange,
  jsonInputExpanded,
  jsonOutputExpanded,
  jsonMetadataExpanded,
  onJsonInputExpandedChange,
  onJsonOutputExpandedChange,
  onJsonMetadataExpandedChange,
  advancedJsonExpansionState,
  onAdvancedJsonExpansionChange,
  enableInlineComments = false,
  onAddInlineComment,
  commentedPathsByField,
  onVirtualizationChange,
  hideMetadata = true,
  observationId,
  observationType,
  projectId,
  traceId,
  environment = "default",
  showCorrections = true,
  contentMode = "all",
  showSystemPrompt,
}: IOPreviewProps) {
  const capture = usePostHogClientCapture();
  const [dismissedNotifications, setDismissedNotifications] = useLocalStorage<
    string[]
  >("dismissed-trace-view-notifications", []);
  const [localView, setLocalView] = useLocalStorage<ViewMode>(
    JSON_VIEW_PREFERENCE_STORAGE_KEY,
    DEFAULT_JSON_VIEW_PREFERENCE,
  );
  const selectedView = currentView ?? normalizeJsonViewPreference(localView);
  const [compensateScrollRef, startPreserveScroll] =
    usePreserveRelativeScroll<HTMLDivElement>([selectedView]);
  useEffect(() => {
    setIsPrettyViewAvailable?.(true);
  }, [setIsPrettyViewAvailable]);
  const hasInput = input !== null && input !== undefined;
  const hasOutput = output !== null && output !== undefined;
  const showEmptyState =
    !hasInput &&
    !hasOutput &&
    !observationName &&
    !isLoading &&
    !hideIfNull &&
    !dismissedNotifications.includes("empty-io");
  const isPretty = selectedView === "pretty";
  const isJson = selectedView === "json";
  const isAdvanced = selectedView === "json-beta";

  const {
    fields,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    effectiveOutput,
    outputTooLarge,
    showOutput,
  } = useIOPreviewFields({
    input,
    output,
    metadata,
    parsedInput: preParsedInput,
    parsedOutput: preParsedOutput,
    parsedMetadata: preParsedMetadata,
    selectedView,
    isParsing,
    hideInput,
    hideOutput,
    hideMetadata,
    hideIfNull,
    inputExpansionState,
    outputExpansionState,
    metadataExpansionState,
    onInputExpansionChange,
    onOutputExpansionChange,
    onMetadataExpansionChange,
    jsonInputExpanded,
    jsonOutputExpanded,
    jsonMetadataExpanded,
    onJsonInputExpandedChange,
    onJsonOutputExpandedChange,
    onJsonMetadataExpandedChange,
  });

  // Parse into the shared preview contract.
  const parserResult = useIOPreviewParser(
    isPretty,
    input,
    output,
    metadata,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    chatMLParserResult,
  );

  const shouldRenderMessages =
    isPretty && hasRenderableChatMessages(parserResult);

  useIOParserComparisonCapture({
    input,
    output,
    chatMLParserResult,
    isLoading,
    isParsing,
    observationId,
    traceId,
    shouldRenderMessages,
    enabled: isPretty,
  });

  const { allMessages, inputMessageCount } = parserResult;
  const showData = !isPretty || contentMode !== "conversation";
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
    : showOutput;

  const downloadName = observationId ?? traceId;
  const statusPresentation = useMemo(
    () => (status ? getStatusMessagePresentation(status.level) : undefined),
    [status],
  );
  const parsedStatusMessage = useMemo(
    () => (status ? parseStructuredStatusMessage(status.message) : undefined),
    [status],
  );
  const statusValue = parsedStatusMessage ?? status?.message;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MultiSectionJsonViewerHandle>(null);
  useEffect(() => {
    if (isAdvanced) onVirtualizationChange?.(false);
  }, [isAdvanced, onVirtualizationChange]);

  return (
    <>
      {currentView === undefined && (
        <ViewModeToggle
          selectedView={selectedView}
          compensateScrollRef={compensateScrollRef}
          onViewChange={(view) => {
            startPreserveScroll();
            capture("trace_detail:io_mode_switch", { view });
            setLocalView(view);
          }}
        />
      )}
      <InlineCommentSelectionProvider
        key={`${selectedView}:${enableInlineComments}`}
      >
        <CorrectionController
          projectId={projectId}
          traceId={traceId}
          observationId={observationId}
          environment={environment}
          outputCorrection={outputCorrection}
          actualOutput={effectiveOutput}
          actualOutputTooLarge={outputTooLarge}
          showCorrections={showCorrections}
          hasOutputHeader={hasOutputHeader}
          isAdvanced={isAdvanced}
          isParsing={isParsing}
        >
          {({ outputActions, field, diffDialog }) => {
            const correctedOutputField = (() => {
              if (!field) return null;
              if (field.kind === "trigger")
                return (
                  <div className="py-2">
                    <button
                      type="button"
                      onClick={field.onClick}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      <Pencil size="sm" aria-hidden />
                      Correct output
                    </button>
                  </div>
                );
              return (
                <IOPreviewSection
                  kind="correction"
                  presentation={isAdvanced ? "inline" : "section"}
                  title="Corrected output"
                  info={{
                    label: "About corrected outputs",
                    text: "Corrected outputs allow you to save the expected output for a trace or observation.",
                    docsHref:
                      "https://langfuse.com/docs/observability/features/corrections",
                  }}
                  {...field.sectionProps}
                />
              );
            })();
            return (
              <>
                {diffDialog && <CorrectedOutputDiffDialog {...diffDialog} />}
                {isAdvanced && (
                  <JsonSectionsController
                    fields={fields}
                    status={status}
                    statusValue={statusValue}
                    renderCorrection={
                      correctedOutputField
                        ? () => correctedOutputField
                        : undefined
                    }
                    renderOversizedHeader={(field) => (
                      <div className="flex items-center px-2 py-1.5">
                        <span className="text-xs font-bold">{field.title}</span>
                      </div>
                    )}
                    renderOversizedFooter={(field, probe) =>
                      probe.isString ? (
                        <LargeJsonFieldFallback
                          title={field.title}
                          hideTitle
                          serialized={probe.serialized}
                          isString
                          charCount={probe.size}
                          rowCount={field.rows}
                          downloadFileBase={`${field.key}-${downloadName}`}
                        />
                      ) : (
                        <div className="io-message-content flex flex-col gap-1">
                          <div
                            style={{ height: 400 }}
                            className="overflow-hidden rounded-md border"
                          >
                            <LazyJsonViewer serialized={probe.serialized} />
                          </div>
                          <LargeJsonFieldFallback
                            title={field.title}
                            hideTitle
                            serialized={probe.serialized}
                            isString={false}
                            charCount={probe.size}
                            rowCount={field.rows}
                            downloadFileBase={`${field.key}-${downloadName}`}
                            downloadOnly
                          />
                        </div>
                      )
                    }
                  >
                    {({ sections }) => (
                      <JsonSearchController>
                        {({
                          search,
                          stringWrapMode,
                          cycleWrapMode,
                          viewerProps,
                        }) => {
                          const viewerContent = !isParsing ? (
                            <MultiSectionJsonViewer
                              ref={viewerRef}
                              sections={sections}
                              virtualized={false}
                              showLineNumbers
                              enableCopy
                              {...viewerProps}
                              scrollContainerRef={
                                scrollContainerRef as React.RefObject<HTMLDivElement>
                              }
                              media={media}
                              commentedPathsByField={commentedPathsByField}
                              externalExpansionState={
                                advancedJsonExpansionState
                              }
                              onExpansionChange={onAdvancedJsonExpansionChange}
                              theme={{
                                fontSize: "0.7rem",
                                lineHeight: 14,
                                indentSize: 12,
                              }}
                            />
                          ) : null;

                          return isParsing ? (
                            <div className="flex min-h-0 flex-1 flex-col border-t border-b">
                              <div className="flex h-full items-center justify-center">
                                <div className="text-muted-foreground text-base">
                                  Parsing data...
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="ph-no-capture flex min-h-0 flex-1 flex-col border-t border-b">
                              {enableInlineComments && (
                                <InlineCommentSelectionConsumer>
                                  {(selection) =>
                                    selection?.anchorRect && (
                                      <InlineCommentBubble
                                        positionRect={
                                          selection.startRect ??
                                          selection.anchorRect
                                        }
                                        onAddComment={() =>
                                          onAddInlineComment?.(selection)
                                        }
                                      />
                                    )
                                  }
                                </InlineCommentSelectionConsumer>
                              )}
                              <div className="bg-background flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
                                <Command className="flex-1 rounded-none border-0 bg-transparent">
                                  <CommandInput
                                    showBorder={false}
                                    placeholder="Search across all sections..."
                                    className="h-7 border-0 focus:ring-0"
                                    value={search.query}
                                    onValueChange={search.setQuery}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        if (event.shiftKey)
                                          search.previousMatch();
                                        else search.nextMatch();
                                      } else if (event.key === "Escape")
                                        search.clear();
                                    }}
                                  />
                                </Command>
                                {search.query && (
                                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                                    {search.matchCount > 0
                                      ? `${search.currentMatchIndex + 1} of ${search.matchCount}`
                                      : "No matches"}
                                  </span>
                                )}
                                {search.query && search.matchCount > 0 && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={search.previousMatch}
                                      title="Previous match (Shift+Enter)"
                                    >
                                      <ChevronUp size="base" color="default" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={search.nextMatch}
                                      title="Next match (Enter)"
                                    >
                                      <ChevronDown
                                        size="base"
                                        color="default"
                                      />
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title={`String wrap mode: ${stringWrapMode}`}
                                  onClick={cycleWrapMode}
                                >
                                  {stringWrapMode === "truncate" && (
                                    <Minus size="base" />
                                  )}
                                  {stringWrapMode === "wrap" && (
                                    <WrapText size="base" />
                                  )}
                                  {stringWrapMode === "nowrap" && (
                                    <ChevronDown
                                      size="base"
                                      __rawClassName="-rotate-90"
                                    />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Copy to clipboard"
                                  onClick={() => {
                                    const data: Record<string, unknown> = {};
                                    for (const field of fields) {
                                      if (field.show)
                                        data[field.key] = field.tooLarge
                                          ? "<omitted: too large to render — use the field download>"
                                          : field.value;
                                    }
                                    navigator.clipboard.writeText(
                                      JSON.stringify(data, null, 2),
                                    );
                                  }}
                                >
                                  <Copy size="base" color="default" />
                                </Button>
                              </div>
                              <div className="bg-background flex h-6 shrink-0 items-center gap-1.5 border-b px-2">
                                <span className="text-muted-foreground text-xs">
                                  Jump to:
                                </span>
                                {sections.map((section, index) => (
                                  <span
                                    key={section.key}
                                    className="flex items-center"
                                  >
                                    <button
                                      onClick={() =>
                                        viewerRef.current?.scrollToSection(
                                          section.key,
                                        )
                                      }
                                      className="text-primary cursor-pointer text-xs hover:underline"
                                    >
                                      {section.title}
                                    </button>
                                    {index < sections.length - 1 && (
                                      <span className="text-muted-foreground text-xs">
                                        ,&nbsp;
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                              <div
                                className="min-h-0 flex-1 overflow-auto"
                                ref={scrollContainerRef}
                              >
                                {enableInlineComments ? (
                                  <CommentableJsonView enabled>
                                    {viewerContent}
                                  </CommentableJsonView>
                                ) : (
                                  viewerContent
                                )}
                              </div>
                            </div>
                          );
                        }}
                      </JsonSearchController>
                    )}
                  </JsonSectionsController>
                )}
                {!isAdvanced && (
                  <ConversationController
                    parserResult={parserResult}
                    parsedInput={parsedInput}
                    parsedOutput={parsedOutput}
                    isPretty={isPretty}
                    showData={showData}
                    contentMode={contentMode}
                    showSystemPrompt={showSystemPrompt}
                    observationType={observationType}
                    media={media}
                    outputActions={outputActions}
                  >
                    {({
                      tools,
                      messages,
                      history,
                      additionalInput,
                      media: conversationMedia,
                      shouldRenderMarkdown,
                    }) => (
                      <div className="space-y-2 pt-3">
                        {showData &&
                          status &&
                          statusPresentation &&
                          (parsedStatusMessage !== undefined ? (
                            <IOPreviewSection
                              kind="json"
                              title={statusPresentation.title}
                              jsonProps={{
                                json: status.message,
                                parsedJson: parsedStatusMessage,
                                currentView: isJson ? "json" : "pretty",
                              }}
                              tone={statusPresentation.tone}
                            />
                          ) : (
                            <IOPreviewSection
                              kind="status"
                              title={statusPresentation.title}
                              tone={statusPresentation.tone}
                              text={status.message}
                            />
                          ))}

                        {tools && <IOPreviewSection {...tools} />}

                        {isPretty &&
                        showData &&
                        skills &&
                        skills.items.length > 0 ? (
                          <IOPreviewSection
                            kind="skills"
                            title="Skills"
                            skills={skills}
                            projectId={projectId}
                          />
                        ) : null}

                        {shouldRenderMessages ? (
                          <div>
                            <div className="flex max-h-full min-h-0 flex-col gap-2">
                              <div className="flex max-h-full min-h-0 flex-col gap-2">
                                <div className="flex flex-col gap-2">
                                  {messages.map(
                                    ({ originalIndex, props }, index) => (
                                      <Fragment key={originalIndex}>
                                        <IOPreviewSection {...props} />
                                        {history.show && index === 0 && (
                                          <button
                                            type="button"
                                            className="io-message-header text-muted-foreground focus-visible:ring-ring flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden"
                                            aria-expanded={history.isOpen}
                                            aria-label={history.label}
                                            onClick={history.toggle}
                                          >
                                            {history.isOpen ? (
                                              <ChevronDown
                                                size="base"
                                                color="default"
                                                aria-hidden
                                              />
                                            ) : (
                                              <ChevronRight
                                                size="base"
                                                color="default"
                                                aria-hidden
                                              />
                                            )}
                                            {history.label}
                                          </button>
                                        )}
                                      </Fragment>
                                    ),
                                  )}
                                </div>
                                {additionalInput && (
                                  <IOPreviewSection
                                    kind="json"
                                    title="Additional Input"
                                    jsonProps={{
                                      json: additionalInput,
                                      currentView: shouldRenderMarkdown
                                        ? "pretty"
                                        : "json",
                                    }}
                                  />
                                )}
                                {conversationMedia.length > 0 && (
                                  <IOPreviewSection
                                    kind="media"
                                    title="Media"
                                    media={conversationMedia}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        ) : showData ? (
                          <div className="space-y-2">
                            {fields.map((field) => (
                              <Fragment key={field.key}>
                                {field.show &&
                                  (isJson && field.tooLarge && field.probe ? (
                                    <IOPreviewSection
                                      kind="large-json"
                                      title={field.title}
                                      actions={
                                        field.key === "output"
                                          ? outputActions
                                          : undefined
                                      }
                                      fallback={{
                                        serialized: field.probe.serialized,
                                        isString: field.probe.isString,
                                        charCount: field.probe.size,
                                        downloadFileBase: `${field.key}-${downloadName}`,
                                      }}
                                    />
                                  ) : (
                                    <IOPreviewSection
                                      kind="json"
                                      title={field.title}
                                      actions={
                                        field.key === "output"
                                          ? outputActions
                                          : undefined
                                      }
                                      jsonProps={{
                                        json: isJson ? field.raw : field.value,
                                        parsedJson: isJson
                                          ? field.value
                                          : undefined,
                                        isLoading,
                                        isParsing,
                                        media:
                                          media?.filter(
                                            (item) => item.field === field.key,
                                          ) ?? [],
                                        currentView: isJson ? "json" : "pretty",
                                        externalExpansionState: field.expansion,
                                        onExternalExpansionChange: (
                                          expansion,
                                        ) => {
                                          if (isJson) {
                                            if (typeof expansion === "boolean")
                                              field.onJsonExpansion?.(
                                                expansion,
                                              );
                                          } else field.onExpansion?.(expansion);
                                        },
                                      }}
                                    />
                                  ))}
                                {field.key === "output" && correctedOutputField}
                              </Fragment>
                            ))}
                          </div>
                        ) : null}
                        {(shouldRenderMessages || !showData) &&
                          correctedOutputField}
                      </div>
                    )}
                  </ConversationController>
                )}
              </>
            );
          }}
        </CorrectionController>
      </InlineCommentSelectionProvider>
      {showEmptyState && (
        <div className="py-2">
          <div className="relative flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1.5 right-1.5 h-5 w-5 p-0"
              title="Dismiss"
              onClick={() => {
                capture("notification:dismiss_notification", {
                  notification_id: "empty-io",
                });
                setDismissedNotifications((previous) =>
                  previous.includes("empty-io")
                    ? previous
                    : [...previous, "empty-io"],
                );
              }}
            >
              <X size="base" color="default" />
            </Button>
            <div className="flex w-full flex-row items-center gap-2 pr-6">
              <div className="bg-accent flex h-8 w-8 items-center justify-center rounded-full">
                <BookOpen size="base" color="muted" />
              </div>
              <h3 className="text-base font-bold">
                Looks like this trace didn&apos;t receive an input or output.
              </h3>
            </div>
            <p className="text-muted-foreground max-w-sm text-base">
              Add it in your code to make debugging a lot easier.
            </p>
            <ActionButton
              variant="outline"
              size="sm"
              href="https://langfuse.com/faq/all/empty-trace-input-and-output"
              trackingEventName="notification:click_link"
              trackingProps={{ notification_id: "empty-io" }}
            >
              View Documentation
            </ActionButton>
          </div>
        </div>
      )}
    </>
  );
}

function InlineCommentSelectionConsumer({
  children,
}: {
  children: (selection: SelectionData | null) => React.ReactNode;
}) {
  const selectionContext = useInlineCommentSelectionOptional();
  return children(selectionContext?.selection ?? null);
}

type JsonSectionField = Pick<
  ReturnType<typeof useIOPreviewField>,
  "show" | "value" | "tooLarge" | "rows"
> & { key: string; title: string };

function JsonSectionsController({
  fields,
  status,
  statusValue,
  renderCorrection,
  renderOversizedHeader,
  renderOversizedFooter,
  children,
}: Pick<IOPreviewContentProps, "status"> & {
  fields: JsonSectionField[];
  statusValue: unknown;
  renderCorrection: (() => React.ReactNode) | undefined;
  renderOversizedHeader: (field: JsonSectionField) => React.ReactNode;
  renderOversizedFooter: (
    field: JsonSectionField,
    probe: ReturnType<typeof probeJsonField>,
  ) => React.ReactNode;
  children: (preview: {
    sections: React.ComponentProps<typeof MultiSectionJsonViewer>["sections"];
  }) => React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  // Render callbacks can change without reserializing oversized fields.
  const preparedFields = useMemo(
    () =>
      fields
        .filter((field) => field.show)
        .map((field) => ({
          field,
          // Reuse one serialization for the lazy engine and the download hatch.
          probe: field.tooLarge ? probeJsonField(field.value) : null,
        })),
    [fields],
  );
  const sections = useMemo(() => {
    const result: React.ComponentProps<
      typeof MultiSectionJsonViewer
    >["sections"] = [];
    if (status) {
      const backgroundColor = (() => {
        if (status.level === "ERROR")
          return isDark ? "var(--light-red)" : "oklch(97.1% 0.013 17.38)";
        if (status.level === "WARNING")
          return isDark ? "var(--light-yellow)" : "oklch(98.7% 0.026 102.212)";
        return "hsl(var(--surface-section))";
      })();
      result.push({
        key: "status-message",
        title: getStatusMessagePresentation(status.level).title,
        data: statusValue,
        backgroundColor,
        minHeight: "4px",
      });
    }
    for (const { field, probe } of preparedFields) {
      const backgroundColor = (() => {
        if (field.key === "input")
          return isDark ? "rgb(15, 23, 42)" : "rgb(249, 252, 255)";
        if (field.key === "metadata")
          return isDark ? "rgb(30, 20, 40)" : "rgb(253, 251, 254)";
        return "hsl(var(--surface-section))";
      })();
      if (probe) {
        result.push({
          // Gated fields never inherit a persisted collapse that could hide the
          // download escape hatch; they have no eager tree to collapse.
          key: `${field.key}__oversized`,
          title: field.title,
          data: null,
          hideData: true,
          backgroundColor,
          minHeight: "4px",
          renderHeader: () => renderOversizedHeader(field),
          renderFooter: () => renderOversizedFooter(field, probe),
        });
      } else {
        result.push({
          key: field.key,
          title: field.title,
          data: field.value,
          backgroundColor,
          minHeight: "200px",
        });
      }
    }
    if (renderCorrection) {
      // Corrections stay between Output and Metadata, even when Output is hidden.
      const metadataIndex = result.findIndex(
        (section) =>
          section.key === "metadata" || section.key === "metadata__oversized",
      );
      result.splice(metadataIndex === -1 ? result.length : metadataIndex, 0, {
        key: "corrections",
        title: "Output correction",
        data: null,
        hideData: true,
        backgroundColor: "hsl(var(--surface-section))",
        minHeight: "4px",
        renderFooter: renderCorrection,
      });
    }
    return result;
  }, [
    preparedFields,
    status,
    statusValue,
    isDark,
    renderCorrection,
    renderOversizedHeader,
    renderOversizedFooter,
  ]);
  return children({ sections });
}

function ConversationController({
  parserResult,
  parsedInput,
  parsedOutput,
  isPretty,
  showData,
  contentMode,
  showSystemPrompt,
  observationType,
  media,
  outputActions,
  children,
}: Pick<
  IOPreviewContentProps,
  "showSystemPrompt" | "observationType" | "media"
> & {
  parserResult: ReturnType<typeof useIOPreviewParser>;
  parsedInput: unknown;
  parsedOutput: unknown;
  isPretty: boolean;
  showData: boolean;
  contentMode: IOPreviewContentMode;
  outputActions: CorrectionSectionProps["actions"];
  children: (sections: {
    tools: Extract<
      React.ComponentProps<typeof IOPreviewSection>,
      { kind: "tools" }
    > | null;
    messages: {
      originalIndex: number;
      props: Extract<
        React.ComponentProps<typeof IOPreviewSection>,
        { kind: "message" }
      >;
    }[];
    history: {
      isOpen: boolean;
      show: boolean;
      label: string;
      toggle: () => void;
    };
    additionalInput: ReturnType<typeof useIOPreviewParser>["additionalInput"];
    media: MediaReturnType[];
    shouldRenderMarkdown: boolean;
  }) => React.ReactNode;
}) {
  const [othersOpen, setOthersOpen] = useState(false);
  const [activeToolTab, setActiveToolTab] = useState<"called" | "not-called">(
    "called",
  );
  const [storedToolsCollapsed, setStoredToolsCollapsed] = useSessionStorage<
    boolean | null
  >(TOOLS_COLLAPSED_KEY, null);
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
          if ((toolCallCounts.get(tool.name) ?? 0) > 0)
            groups.calledTools.push(tool);
          else groups.notCalledTools.push(tool);
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
  const shouldRenderMarkdown = useMemo(() => {
    if (!isPretty) return false;
    // Estimate without serializing potentially large payloads.
    const estimateSize = (obj: unknown): number => {
      if (obj === null || obj === undefined) return 4;
      if (typeof obj === "string") return obj.length;
      if (typeof obj === "number") return obj.toString().length;
      if (typeof obj === "boolean") return obj ? 4 : 5;
      if (Array.isArray(obj))
        return obj.reduce((sum, item) => sum + estimateSize(item) + 1, 2);
      if (typeof obj === "object")
        return Object.entries(obj).reduce(
          (sum, [key, value]) => sum + key.length + estimateSize(value) + 3,
          2,
        );
      return 0;
    };
    return (
      estimateSize(parsedInput) +
        estimateSize(parsedOutput) +
        estimateSize(allMessages) <=
      characterLimit
    );
  }, [parsedInput, parsedOutput, allMessages, characterLimit, isPretty]);
  const messagesToRender = useMemo(
    () =>
      allMessages
        .map((message, originalIndex) => ({ message, originalIndex }))
        .filter(({ message }) =>
          shouldRenderMessageForContentMode(
            message,
            contentMode,
            showSystemPrompt,
          ),
        ),
    [allMessages, contentMode, showSystemPrompt],
  );
  const foldsMiddle = messagesToRender.length > FOLD_ABOVE_MESSAGES;
  const foldEnd = messagesToRender.length - EXPANDED_TAIL_LENGTH;
  const otherMessagesCount = foldEnd - 1;
  const otherMessagesLabel = `${otherMessagesCount} other ${otherMessagesCount === 1 ? "message" : "messages"}`;
  const lastOutputIndex = messagesToRender.reduce(
    (last, { originalIndex }, index) =>
      originalIndex >= (inputMessageCount ?? 0) ? index : last,
    -1,
  );
  const remainingMedia = useMemo(() => {
    if (!isPretty) return [];
    if (!shouldRenderMarkdown) return media ?? [];
    const renderedMediaIds = new Set<string>();
    messagesToRender.forEach(({ message }) => {
      const content = message.content || "";
      // JSON fallbacks still need the separate media section.
      if (canRenderContentAsMarkdown(content, characterLimit))
        getRenderedInlineMediaIds({
          markdown: content,
          audio: message.audio,
        }).forEach((mediaId) => renderedMediaIds.add(mediaId));
    });
    return filterAlreadyRenderedMedia(media, renderedMediaIds);
  }, [media, shouldRenderMarkdown, messagesToRender, characterLimit, isPretty]);
  // Only generations use role titles; tools, spans and agents use Input / Output.
  const titleBySide =
    observationType !== undefined && observationType !== "GENERATION";

  return children({
    tools:
      showData && allTools.length > 0
        ? {
            kind: "tools",
            title: "Tools",
            activeTab: activeToolTab,
            toolsProps: { tools: visibleTools, toolCallsByName },
            collapsed:
              storedToolsCollapsed ??
              allTools.length > TOOLS_COLLAPSE_THRESHOLD,
            onCollapsedChange: setStoredToolsCollapsed,
            tabs: hasToolTabs
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
              : undefined,
          }
        : null,
    messages: messagesToRender.flatMap(
      ({ message, originalIndex }, filteredIndex) => {
        const isOutputMessage = originalIndex >= (inputMessageCount ?? 0);
        const sideTitle = isOutputMessage ? "Output" : "Input";
        const folded =
          foldsMiddle && filteredIndex > 0 && filteredIndex < foldEnd;
        // Folded messages do not mount (no parsing) until the row opens.
        if (folded && !othersOpen) return [];
        return [
          {
            originalIndex,
            props: {
              kind: "message",
              title: titleBySide ? sideTitle : getMessageTitle(message),
              isOutputMessage,
              messageProps: {
                message,
                shouldRenderMarkdown,
                currentView: "pretty",
                toolCallNumbers: messageToToolCallNumbers.get(originalIndex),
                contentMode,
              },
              defaultCollapsed: foldsMiddle
                ? folded
                : message.role !== "system" &&
                  filteredIndex <
                    messagesToRender.length - EXPANDED_TAIL_LENGTH,
              actions:
                filteredIndex === lastOutputIndex ? outputActions : undefined,
            },
          },
        ];
      },
    ),
    history: {
      isOpen: othersOpen,
      show: foldsMiddle,
      label: otherMessagesLabel,
      toggle: () => setOthersOpen((open) => !open),
    },
    additionalInput:
      showData && additionalInput && Object.keys(additionalInput).length > 0
        ? additionalInput
        : undefined,
    media: remainingMedia,
    shouldRenderMarkdown,
  });
}

function JsonSearchController({
  children,
}: {
  children: (preview: {
    search: {
      query: string;
      setQuery: (query: string) => void;
      currentMatchIndex: number;
      matchCount: number;
      nextMatch: () => void;
      previousMatch: () => void;
      clear: () => void;
    };
    stringWrapMode: ReturnType<typeof useJsonViewPreferences>["stringWrapMode"];
    cycleWrapMode: () => void;
    viewerProps: Pick<
      React.ComponentProps<typeof MultiSectionJsonViewer>,
      | "stringWrapMode"
      | "truncateStringsAt"
      | "searchQuery"
      | "currentMatchIndex"
      | "onSearchResults"
    >;
  }) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setCurrentMatchIndex(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const nextMatch = () => {
    if (matchCount > 0)
      setCurrentMatchIndex((index) => (index + 1) % matchCount);
  };
  const previousMatch = () => {
    if (matchCount > 0)
      setCurrentMatchIndex((index) =>
        index === 0 ? matchCount - 1 : index - 1,
      );
  };
  const clear = () => {
    setQuery("");
    setDebouncedQuery("");
    setCurrentMatchIndex(0);
  };
  const { stringWrapMode, setStringWrapMode } = useJsonViewPreferences();
  const cycleWrapMode = () => {
    if (stringWrapMode === "truncate") setStringWrapMode("wrap");
    else if (stringWrapMode === "wrap") setStringWrapMode("nowrap");
    else setStringWrapMode("truncate");
  };
  return children({
    search: {
      query,
      setQuery,
      currentMatchIndex,
      matchCount,
      nextMatch,
      previousMatch,
      clear,
    },
    stringWrapMode,
    cycleWrapMode,
    viewerProps: {
      stringWrapMode,
      truncateStringsAt: stringWrapMode === "truncate" ? 100 : null,
      searchQuery: debouncedQuery,
      currentMatchIndex,
      onSearchResults: setMatchCount,
    },
  });
}

function useIOPreviewFields({
  input,
  output,
  metadata,
  parsedInput: preParsedInput,
  parsedOutput: preParsedOutput,
  parsedMetadata: preParsedMetadata,
  selectedView,
  isParsing,
  hideInput,
  hideOutput,
  hideMetadata,
  hideIfNull,
  inputExpansionState,
  outputExpansionState,
  metadataExpansionState,
  onInputExpansionChange,
  onOutputExpansionChange,
  onMetadataExpansionChange,
  jsonInputExpanded,
  jsonOutputExpanded,
  jsonMetadataExpanded,
  onJsonInputExpandedChange,
  onJsonOutputExpandedChange,
  onJsonMetadataExpandedChange,
}: Pick<
  IOPreviewContentProps,
  | "input"
  | "output"
  | "metadata"
  | "parsedInput"
  | "parsedOutput"
  | "parsedMetadata"
  | "inputExpansionState"
  | "outputExpansionState"
  | "metadataExpansionState"
  | "onInputExpansionChange"
  | "onOutputExpansionChange"
  | "onMetadataExpansionChange"
  | "jsonInputExpanded"
  | "jsonOutputExpanded"
  | "jsonMetadataExpanded"
  | "onJsonInputExpandedChange"
  | "onJsonOutputExpandedChange"
  | "onJsonMetadataExpandedChange"
> &
  Required<
    Pick<
      IOPreviewContentProps,
      "isParsing" | "hideInput" | "hideOutput" | "hideMetadata" | "hideIfNull"
    >
  > & { selectedView: ViewMode }) {
  const isJson = selectedView === "json";
  const {
    parsed: parsedInput,
    value: effectiveInput,
    probe: inputProbe,
    rows: inputRows,
    tooLarge: inputTooLarge,
    show: showInput,
  } = useIOPreviewField({
    raw: input,
    preParsed: preParsedInput,
    selectedView,
    isParsing,
    hidden: hideInput,
    hideIfNull,
    isMetadata: false,
  });
  const {
    parsed: parsedOutput,
    value: effectiveOutput,
    probe: outputProbe,
    rows: outputRows,
    tooLarge: outputTooLarge,
    show: showOutput,
  } = useIOPreviewField({
    raw: output,
    preParsed: preParsedOutput,
    selectedView,
    isParsing,
    hidden: hideOutput,
    hideIfNull,
    isMetadata: false,
  });
  const {
    parsed: parsedMetadata,
    value: effectiveMetadata,
    probe: metadataProbe,
    rows: metadataRows,
    tooLarge: metadataTooLarge,
    show: showMetadata,
  } = useIOPreviewField({
    raw: metadata,
    preParsed: preParsedMetadata,
    selectedView,
    isParsing,
    hidden: hideMetadata,
    hideIfNull,
    isMetadata: true,
  });
  const fields = useMemo(
    () => [
      {
        key: "input",
        title: "Input",
        show: showInput,
        raw: input,
        value: effectiveInput,
        tooLarge: inputTooLarge,
        rows: inputRows,
        probe: inputProbe,
        expansion: isJson ? jsonInputExpanded : inputExpansionState,
        onExpansion: onInputExpansionChange,
        onJsonExpansion: onJsonInputExpandedChange,
      },
      {
        key: "output",
        title: "Output",
        show: showOutput,
        raw: output,
        value: effectiveOutput,
        tooLarge: outputTooLarge,
        rows: outputRows,
        probe: outputProbe,
        expansion: isJson ? jsonOutputExpanded : outputExpansionState,
        onExpansion: onOutputExpansionChange,
        onJsonExpansion: onJsonOutputExpandedChange,
      },
      {
        key: "metadata",
        title: "Metadata",
        show: showMetadata,
        raw: metadata,
        value: effectiveMetadata,
        tooLarge: metadataTooLarge,
        rows: metadataRows,
        probe: metadataProbe,
        expansion: isJson ? jsonMetadataExpanded : metadataExpansionState,
        onExpansion: onMetadataExpansionChange,
        onJsonExpansion: onJsonMetadataExpandedChange,
      },
    ],
    [
      showInput,
      showOutput,
      showMetadata,
      input,
      output,
      metadata,
      effectiveInput,
      effectiveOutput,
      effectiveMetadata,
      inputTooLarge,
      outputTooLarge,
      metadataTooLarge,
      inputRows,
      outputRows,
      metadataRows,
      inputProbe,
      outputProbe,
      metadataProbe,
      isJson,
      jsonInputExpanded,
      jsonOutputExpanded,
      jsonMetadataExpanded,
      inputExpansionState,
      outputExpansionState,
      metadataExpansionState,
      onInputExpansionChange,
      onOutputExpansionChange,
      onMetadataExpansionChange,
      onJsonInputExpandedChange,
      onJsonOutputExpandedChange,
      onJsonMetadataExpandedChange,
    ],
  );
  return {
    fields,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    effectiveOutput,
    outputTooLarge,
    showOutput,
  };
}

function useIOPreviewField({
  raw,
  preParsed,
  selectedView,
  isParsing,
  hidden,
  hideIfNull,
  isMetadata,
}: {
  raw: Prisma.JsonValue | undefined;
  preParsed: unknown;
  selectedView: ViewMode;
  isParsing: boolean;
  hidden: boolean;
  hideIfNull: boolean;
  isMetadata: boolean;
}) {
  const isPretty = selectedView === "pretty";
  const isAdvanced = selectedView === "json-beta";
  // Legacy JSON must probe raw fields before its eager renderer parses them.
  const probe = useMemo(
    () =>
      selectedView === "json" && !(isMetadata && hidden)
        ? probeJsonField(raw)
        : null,
    [raw, selectedView, isMetadata, hidden],
  );
  const overCharLimit = (probe?.size ?? 0) > JSON_VIEW_RENDER_CHAR_LIMIT;
  const parsed = useMemo(() => {
    if (isParsing || overCharLimit || (isMetadata && hidden && !isPretty))
      return undefined;
    if (preParsed !== undefined && preParsed !== null) return preParsed;
    if (isPretty)
      return deepParseJson(raw, {
        maxSize: isMetadata ? 100_000 : 300_000,
        maxDepth: 2,
      });
    return deepParseJson(raw);
  }, [raw, preParsed, isParsing, overCharLimit, isMetadata, hidden, isPretty]);
  // Advanced JSON gates by rows, not characters: a huge string is one leaf.
  const rows = useMemo(
    () => (isAdvanced ? countJsonRows(parsed) : 0),
    [parsed, isAdvanced],
  );
  // Decode all-or-nothing so the viewer and download never mix decoded/raw text.
  const value = useMemo(
    () =>
      isAdvanced && rows <= DECODE_UNICODE_MAX_NODES
        ? decodeUnicodeInJson(parsed)
        : parsed,
    [isAdvanced, rows, parsed],
  );
  const tooLarge = overCharLimit || rows > JSON_VIEW_RENDER_ROW_LIMIT;
  const show = (() => {
    if (hidden) return false;
    if (!tooLarge && hideIfNull)
      return isAdvanced ? value !== undefined : !!value;
    return true;
  })();
  return { parsed, value, probe, rows, tooLarge, show };
}

function CorrectionController({
  projectId,
  traceId,
  observationId,
  environment,
  outputCorrection,
  actualOutput,
  actualOutputTooLarge,
  showCorrections,
  hasOutputHeader,
  isAdvanced,
  isParsing,
  children,
}: Pick<
  IOPreviewContentProps,
  "projectId" | "traceId" | "observationId" | "outputCorrection"
> & {
  environment: string;
  actualOutput: unknown;
  actualOutputTooLarge: boolean;
  showCorrections: boolean;
  hasOutputHeader: boolean;
  isAdvanced: boolean;
  isParsing: boolean;
  children: (correction: {
    outputActions: CorrectionSectionProps["actions"];
    field:
      | null
      | { kind: "trigger"; onClick: () => void }
      | {
          kind: "editor";
          sectionProps: Pick<
            CorrectionSectionProps,
            | "status"
            | "actions"
            | "toggle"
            | "hasContent"
            | "isEditing"
            | "canEdit"
            | "onEdit"
            | "editor"
          >;
        };
    diffDialog: React.ComponentProps<typeof CorrectedOutputDiffDialog> | null;
  }) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({ projectId, scope: "scores:save" });
  const { effectiveCorrection, correctionValue } = useCorrectionData(
    outputCorrection,
    observationId,
    traceId,
  );
  const [strictJsonMode, setStrictJsonMode] = useLocalStorage(
    "correctionStrictJsonMode",
    false,
  );
  const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const focusEditor = useCallback(() => {
    requestAnimationFrame(() => editorRef.current?.view?.focus());
  }, []);
  const { saveStatus, setSaveStatus, handleSave, handleDelete } =
    useCorrectionMutations({
      projectId,
      traceId,
      observationId,
      environment,
      effectiveCorrection,
    });
  const {
    isEditing,
    setIsEditing,
    value,
    isValidJson,
    handleEdit,
    handleChange,
  } = useCorrectionEditor({
    correctionValue,
    actualOutput: actualOutputTooLarge ? undefined : actualOutput,
    onSave: handleSave,
    setSaveStatus,
    strictJsonMode,
  });
  const open = () => {
    capture("trace_detail:io_section_collapse_toggle", {
      section: "corrected_output",
      collapsed: false,
    });
    setIsOpen(true);
    if (hasAccess) handleEdit();
  };
  const hasContent = isEditing
    ? value.trim().length > 0
    : correctionValue.trim().length > 0;
  const displayValue = useMemo(() => {
    if (!value) return "";
    try {
      const parsed: unknown = JSON.parse(value);
      if (!strictJsonMode && typeof parsed === "string") return parsed;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }, [value, strictJsonMode]);
  const status: CorrectionSectionProps["status"] = (() => {
    if (!isValidJson) {
      if (!isEditing || !hasContent) return undefined;
      return {
        kind: "error",
        text: strictJsonMode
          ? "Invalid JSON - fix to save"
          : "Cannot save empty content",
      };
    }
    if (saveStatus === "saving") return { kind: "saving", text: "Saving" };
    if (saveStatus === "saved") return { kind: "saved", text: "Saved" };
    return undefined;
  })();
  const actions: NonNullable<CorrectionSectionProps["actions"]> = hasContent
    ? [
        {
          icon: FileDiff,
          label: "View diff between original and corrected output",
          onClick: () => setIsDiffDialogOpen(true),
        },
        ...(!isEditing
          ? [
              {
                icon: Pencil,
                label: "Edit corrected output",
                onClick: handleEdit,
                disabled: !hasAccess,
              },
            ]
          : []),
        {
          icon: Trash,
          label: "Delete corrected output",
          disabled: !hasAccess,
          onClick: () => {
            handleDelete();
            setIsEditing(false);
            setIsOpen(false);
          },
        },
      ]
    : [];
  const jsonToggle: CorrectionSectionProps["toggle"] = {
    label: "JSON",
    checked: strictJsonMode,
    disabled: !isEditing,
    onCheckedChange: (strict) => {
      setStrictJsonMode(strict);
      if (!isEditing || !value.trim() || !strict) return;
      try {
        JSON.parse(value);
      } catch {
        handleChange(JSON.stringify(value));
      }
    },
  };
  const editor: CorrectionSectionProps["editor"] = {
    value: displayValue,
    onChange: handleChange,
    mode: strictJsonMode ? "json" : "text",
    editorRef,
    onEditorMount: focusEditor,
  };

  // Without an Output header, keep the inline entry point available.
  const hasHeaderTrigger = !isAdvanced && hasOutputHeader;
  const outputActions: CorrectionSectionProps["actions"] =
    showCorrections && hasHeaderTrigger && !isOpen && !effectiveCorrection
      ? [
          {
            icon: Pencil,
            label: "Correct output",
            disabled: !hasAccess,
            onClick: open,
          },
        ]
      : undefined;
  const field: Parameters<typeof children>[0]["field"] = (() => {
    if (!showCorrections) return null;
    if (!isOpen && !effectiveCorrection) {
      if (hasHeaderTrigger) return null;
      return { kind: "trigger", onClick: open };
    }
    return {
      kind: "editor",
      sectionProps: {
        status,
        actions,
        toggle: jsonToggle,
        hasContent,
        isEditing,
        canEdit: hasAccess,
        onEdit: handleEdit,
        editor,
      },
    };
  })();

  return children({
    outputActions,
    field,
    diffDialog:
      showCorrections &&
      !(isAdvanced && isParsing) &&
      (isOpen || effectiveCorrection)
        ? {
            isOpen: isDiffDialogOpen,
            setIsOpen: setIsDiffDialogOpen,
            actualOutput: actualOutputTooLarge ? undefined : actualOutput,
            actualOutputTooLarge,
            correctedOutput: value,
            strictJsonMode,
          }
        : null,
  });
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
  enabled,
}: Pick<
  IOPreviewProps,
  | "input"
  | "output"
  | "chatMLParserResult"
  | "isLoading"
  | "isParsing"
  | "observationId"
  | "traceId"
> & { shouldRenderMessages: boolean; enabled: boolean }) {
  const capture = usePostHogClientCapture();
  const capturedNormalizationRecord = useRef<string | undefined>(undefined);

  /** Empty payloads are excluded from the normalization success metric. */
  const hasPayloadToNormalize =
    (input !== null && input !== undefined) ||
    (output !== null && output !== undefined);

  useEffect(() => {
    if (
      !enabled ||
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
    enabled,
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
