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
  ...props
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
  const content = (
    <IOPreviewContent
      key={selectedView}
      {...props}
      selectedView={selectedView}
    />
  );
  const hasInput = props.input !== null && props.input !== undefined;
  const hasOutput = props.output !== null && props.output !== undefined;
  const showEmptyState =
    !hasInput &&
    !hasOutput &&
    !observationName &&
    !props.isLoading &&
    !props.hideIfNull &&
    !dismissedNotifications.includes("empty-io");
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
      {selectedView === "json-beta" && props.enableInlineComments ? (
        <InlineCommentSelectionProvider>
          {content}
        </InlineCommentSelectionProvider>
      ) : (
        content
      )}
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

// The keyed content resets mode-local state and keeps the selection consumer
// below its provider. Only the active mode's parsing and renderer run.
function IOPreviewContent({
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
  selectedView,
  hideMetadata = true,
  observationId,
  observationType,
  projectId,
  traceId,
  environment = "default",
  showCorrections = true,
  contentMode = "all",
  showSystemPrompt,
}: IOPreviewContentProps & { selectedView: ViewMode }) {
  const isPretty = selectedView === "pretty";
  const isJson = selectedView === "json";
  const isAdvanced = selectedView === "json-beta";
  const [othersOpen, setOthersOpen] = useState(false);
  const [activeToolTab, setActiveToolTab] = useState<"called" | "not-called">(
    "called",
  );
  const [storedToolsCollapsed, setStoredToolsCollapsed] = useSessionStorage<
    boolean | null
  >(TOOLS_COLLAPSED_KEY, null);

  // Legacy JSON must probe RAW fields before parsing: its eager renderer cannot
  // safely materialize multi-MB payloads. Other modes do not pay this cost.
  const inputProbe = useMemo(
    () => (isJson ? probeJsonField(input) : null),
    [input, isJson],
  );
  const outputProbe = useMemo(
    () => (isJson ? probeJsonField(output) : null),
    [output, isJson],
  );
  const metadataProbe = useMemo(
    () => (isJson && !hideMetadata ? probeJsonField(metadata) : null),
    [metadata, isJson, hideMetadata],
  );
  const inputOverCharLimit =
    (inputProbe?.size ?? 0) > JSON_VIEW_RENDER_CHAR_LIMIT;
  const outputOverCharLimit =
    (outputProbe?.size ?? 0) > JSON_VIEW_RENDER_CHAR_LIMIT;
  const metadataOverCharLimit =
    (metadataProbe?.size ?? 0) > JSON_VIEW_RENDER_CHAR_LIMIT;
  const parsedInput = useMemo(() => {
    if (isParsing || inputOverCharLimit) return undefined;
    if (preParsedInput !== undefined && preParsedInput !== null)
      return preParsedInput;
    if (isPretty)
      return deepParseJson(input, { maxSize: 300_000, maxDepth: 2 });
    return deepParseJson(input);
  }, [input, preParsedInput, isParsing, inputOverCharLimit, isPretty]);
  const parsedOutput = useMemo(() => {
    if (isParsing || outputOverCharLimit) return undefined;
    if (preParsedOutput !== undefined && preParsedOutput !== null)
      return preParsedOutput;
    if (isPretty)
      return deepParseJson(output, { maxSize: 300_000, maxDepth: 2 });
    return deepParseJson(output);
  }, [output, preParsedOutput, isParsing, outputOverCharLimit, isPretty]);
  const parsedMetadata = useMemo(() => {
    if (isParsing || metadataOverCharLimit || (hideMetadata && !isPretty))
      return undefined;
    if (preParsedMetadata !== undefined && preParsedMetadata !== null)
      return preParsedMetadata;
    if (isPretty)
      return deepParseJson(metadata, { maxSize: 100_000, maxDepth: 2 });
    return deepParseJson(metadata);
  }, [
    metadata,
    preParsedMetadata,
    isParsing,
    metadataOverCharLimit,
    hideMetadata,
    isPretty,
  ]);
  // Advanced JSON gates by rows, not characters: a huge string is one leaf.
  // Decode all-or-nothing so the viewer and download never mix decoded/raw text.
  const inputRows = useMemo(
    () => (isAdvanced ? countJsonRows(parsedInput) : 0),
    [parsedInput, isAdvanced],
  );
  const outputRows = useMemo(
    () => (isAdvanced ? countJsonRows(parsedOutput) : 0),
    [parsedOutput, isAdvanced],
  );
  const metadataRows = useMemo(
    () => (isAdvanced ? countJsonRows(parsedMetadata) : 0),
    [parsedMetadata, isAdvanced],
  );
  const effectiveInput = useMemo(
    () =>
      isAdvanced && inputRows <= DECODE_UNICODE_MAX_NODES
        ? decodeUnicodeInJson(parsedInput)
        : parsedInput,
    [isAdvanced, inputRows, parsedInput],
  );
  const effectiveOutput = useMemo(
    () =>
      isAdvanced && outputRows <= DECODE_UNICODE_MAX_NODES
        ? decodeUnicodeInJson(parsedOutput)
        : parsedOutput,
    [isAdvanced, outputRows, parsedOutput],
  );
  const effectiveMetadata = useMemo(
    () =>
      isAdvanced && metadataRows <= DECODE_UNICODE_MAX_NODES
        ? decodeUnicodeInJson(parsedMetadata)
        : parsedMetadata,
    [isAdvanced, metadataRows, parsedMetadata],
  );
  const inputTooLarge =
    inputOverCharLimit || inputRows > JSON_VIEW_RENDER_ROW_LIMIT;
  const outputTooLarge =
    outputOverCharLimit || outputRows > JSON_VIEW_RENDER_ROW_LIMIT;
  const metadataTooLarge =
    metadataOverCharLimit || metadataRows > JSON_VIEW_RENDER_ROW_LIMIT;
  const showInput =
    !hideInput &&
    (inputTooLarge ||
      !(
        hideIfNull &&
        (isAdvanced ? effectiveInput === undefined : !effectiveInput)
      ));
  const showOutput =
    !hideOutput &&
    (outputTooLarge ||
      !(
        hideIfNull &&
        (isAdvanced ? effectiveOutput === undefined : !effectiveOutput)
      ));
  const showMetadata =
    !hideMetadata &&
    (metadataTooLarge ||
      !(
        hideIfNull &&
        (isAdvanced ? effectiveMetadata === undefined : !effectiveMetadata)
      ));

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
    if (!isPretty) return false;
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
  const HistoryCaret = othersOpen ? ChevronDown : ChevronRight;
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
      // JSON fallbacks do not render media inline and still need the media section.
      if (canRenderContentAsMarkdown(content, characterLimit)) {
        getRenderedInlineMediaIds({
          markdown: content,
          audio: message.audio,
        }).forEach((mediaId) => renderedMediaIds.add(mediaId));
      }
    });
    return filterAlreadyRenderedMedia(media, renderedMediaIds);
  }, [media, shouldRenderMarkdown, messagesToRender, characterLimit, isPretty]);

  // Prepare additional input (only if non-empty)
  const additionalInputToShow = useMemo(() => {
    if (!additionalInput || Object.keys(additionalInput).length === 0) {
      return undefined;
    }
    return additionalInput;
  }, [additionalInput]);

  const showData = !isPretty || contentMode !== "conversation";
  // The "Correct output" pencil lives in the Output header; the field below
  // opens into its editor from there. Without an Output header (no output
  // message rendered) the field keeps its own inline trigger.
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const hasCorrectionAccess = useHasProjectAccess({
    projectId,
    scope: "scores:save",
  });
  const { effectiveCorrection, correctionValue } = useCorrectionData(
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
    : showOutput;
  const correctionTrigger =
    !isAdvanced && hasOutputHeader ? "header" : "inline";
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
    value: correctionEditorValue,
    isValidJson,
    handleEdit,
    handleChange,
  } = useCorrectionEditor({
    correctionValue,
    actualOutput: outputTooLarge ? undefined : effectiveOutput,
    onSave: handleSave,
    setSaveStatus,
    strictJsonMode,
  });
  const openCorrection = () => {
    capture("trace_detail:io_section_collapse_toggle", {
      section: "corrected_output",
      collapsed: false,
    });
    setCorrectionOpen(true);
    if (hasCorrectionAccess) handleEdit();
  };
  const correctOutputAction: NonNullable<
    CorrectionSectionProps["actions"]
  >[number] = {
    icon: Pencil,
    label: "Correct output",
    disabled: !hasCorrectionAccess,
    onClick: openCorrection,
  };
  const outputActions =
    showCorrections &&
    !isAdvanced &&
    hasOutputHeader &&
    !correctionOpen &&
    !effectiveCorrection
      ? [correctOutputAction]
      : undefined;
  // Without an Output header, keep the inline entry point available.
  const showCorrectionField =
    showCorrections &&
    (correctionTrigger === "inline" || correctionOpen || !!effectiveCorrection);
  const hasCorrectionContent = isEditing
    ? correctionEditorValue.trim().length > 0
    : correctionValue.trim().length > 0;
  const correctionDisplayValue = useMemo(() => {
    if (!correctionEditorValue) return "";
    try {
      const parsed: unknown = JSON.parse(correctionEditorValue);
      if (!strictJsonMode && typeof parsed === "string") return parsed;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return correctionEditorValue;
    }
  }, [correctionEditorValue, strictJsonMode]);
  const correctionStatus: CorrectionSectionProps["status"] = (() => {
    if (!isValidJson) {
      if (!isEditing || !hasCorrectionContent) return undefined;
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
  const correctionActions: NonNullable<CorrectionSectionProps["actions"]> =
    hasCorrectionContent
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
                  disabled: !hasCorrectionAccess,
                },
              ]
            : []),
          {
            icon: Trash,
            label: "Delete corrected output",
            disabled: !hasCorrectionAccess,
            onClick: () => {
              handleDelete();
              setIsEditing(false);
              setCorrectionOpen(false);
            },
          },
        ]
      : [];
  const correctionJsonToggle: CorrectionSectionProps["toggle"] = {
    label: "JSON",
    checked: strictJsonMode,
    disabled: !isEditing,
    onCheckedChange: (strict) => {
      setStrictJsonMode(strict);
      if (!isEditing || !correctionEditorValue.trim() || !strict) return;
      try {
        JSON.parse(correctionEditorValue);
      } catch {
        handleChange(JSON.stringify(correctionEditorValue));
      }
    },
  };
  const correctionInfo: CorrectionSectionProps["info"] = {
    label: "About corrected outputs",
    text: "Corrected outputs allow you to save the expected output for a trace or observation.",
    docsHref: "https://langfuse.com/docs/observability/features/corrections",
  };
  const correctedOutputField = (() => {
    if (!showCorrectionField) return null;
    if (!correctionOpen && !effectiveCorrection)
      return (
        <div className="py-2">
          <button
            type="button"
            onClick={openCorrection}
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
        info={correctionInfo}
        status={correctionStatus}
        actions={correctionActions}
        toggle={correctionJsonToggle}
        hasContent={hasCorrectionContent}
        isEditing={isEditing}
        canEdit={hasCorrectionAccess}
        onEdit={handleEdit}
        editor={{
          value: correctionDisplayValue,
          onChange: handleChange,
          mode: strictJsonMode ? "json" : "text",
          editorRef,
          onEditorMount: focusEditor,
        }}
      />
    );
  })();
  const correctionDiffDialog =
    showCorrections && (correctionOpen || effectiveCorrection) ? (
      <CorrectedOutputDiffDialog
        isOpen={isDiffDialogOpen}
        setIsOpen={setIsDiffDialogOpen}
        actualOutput={outputTooLarge ? undefined : effectiveOutput}
        actualOutputTooLarge={outputTooLarge}
        correctedOutput={correctionEditorValue}
        strictJsonMode={strictJsonMode}
      />
    ) : null;
  // Only generations hold a conversation; tools, spans, agents and the rest
  // are titled Input / Output rather than by role. (`isGenerationLike` is
  // wider: it also covers TOOL and AGENT, which carry model usage, not chat.)
  const titleBySide =
    observationType !== undefined && observationType !== "GENERATION";

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
  const downloadName = observationId ?? traceId;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const statusPresentation = useMemo(
    () => (status ? getStatusMessagePresentation(status.level) : undefined),
    [status],
  );
  const parsedStatusMessage = useMemo(
    () => (status ? parseStructuredStatusMessage(status.message) : undefined),
    [status],
  );
  const statusValue = parsedStatusMessage ?? status?.message;
  const { stringWrapMode, setStringWrapMode } = useJsonViewPreferences();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MultiSectionJsonViewerHandle>(null);
  const selectionContext = useInlineCommentSelectionOptional();
  const inlineCommentPositionRect = selectionContext?.selection?.anchorRect
    ? (selectionContext.selection.startRect ??
      selectionContext.selection.anchorRect)
    : null;
  useEffect(() => {
    if (!isAdvanced) return;
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentMatchIndex(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [isAdvanced, searchQuery]);
  useEffect(() => {
    if (isAdvanced) onVirtualizationChange?.(false);
  }, [isAdvanced, onVirtualizationChange]);
  const handleNextMatch = () => {
    if (searchMatchCount > 0)
      setCurrentMatchIndex((index) => (index + 1) % searchMatchCount);
  };
  const handlePreviousMatch = () => {
    if (searchMatchCount > 0)
      setCurrentMatchIndex((index) =>
        index === 0 ? searchMatchCount - 1 : index - 1,
      );
  };
  const handleClearSearch = () => {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setCurrentMatchIndex(0);
  };
  const wrapIcon = (() => {
    if (stringWrapMode === "truncate") return <Minus size="base" />;
    if (stringWrapMode === "wrap") return <WrapText size="base" />;
    return <ChevronDown size="base" __rawClassName="-rotate-90" />;
  })();
  const sections = useMemo(() => {
    if (!isAdvanced) return [];
    const result: React.ComponentProps<
      typeof MultiSectionJsonViewer
    >["sections"] = [];
    if (status && statusPresentation) {
      const backgroundColor = (() => {
        if (status.level === "ERROR")
          return isDark ? "var(--light-red)" : "oklch(97.1% 0.013 17.38)";
        if (status.level === "WARNING")
          return isDark ? "var(--light-yellow)" : "oklch(98.7% 0.026 102.212)";
        return "hsl(var(--surface-section))";
      })();
      result.push({
        key: "status-message",
        title: statusPresentation.title,
        data: statusValue,
        backgroundColor,
        minHeight: "4px",
      });
    }
    for (const field of fields) {
      // Corrections stay between Output and Metadata, even when Output is hidden.
      if (field.key === "metadata" && correctedOutputField)
        result.push({
          key: "corrections",
          title: "Output correction",
          data: null,
          hideData: true,
          backgroundColor: "hsl(var(--surface-section))",
          minHeight: "4px",
          renderFooter: () => correctedOutputField,
        });
      if (!field.show) continue;
      const backgroundColor = (() => {
        if (field.key === "input")
          return isDark ? "rgb(15, 23, 42)" : "rgb(249, 252, 255)";
        if (field.key === "metadata")
          return isDark ? "rgb(30, 20, 40)" : "rgb(253, 251, 254)";
        return "hsl(var(--surface-section))";
      })();
      if (field.tooLarge) {
        // Reuse one serialization for the lazy engine and the download hatch.
        const probe = probeJsonField(field.value);
        result.push({
          // Gated fields never inherit a persisted collapse that could hide the
          // download escape hatch; they have no eager tree to collapse.
          key: `${field.key}__oversized`,
          title: field.title,
          data: null,
          hideData: true,
          backgroundColor,
          minHeight: "4px",
          renderHeader: () => (
            <div className="flex items-center px-2 py-1.5">
              <span className="text-xs font-bold">{field.title}</span>
            </div>
          ),
          renderFooter: () =>
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
            ),
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
    return result;
  }, [
    isAdvanced,
    status,
    statusPresentation,
    statusValue,
    isDark,
    fields,
    downloadName,
    correctedOutputField,
  ]);
  const viewerContent =
    isAdvanced && !isParsing ? (
      <MultiSectionJsonViewer
        ref={viewerRef}
        sections={sections}
        virtualized={false}
        showLineNumbers
        enableCopy
        stringWrapMode={stringWrapMode}
        truncateStringsAt={stringWrapMode === "truncate" ? 100 : null}
        searchQuery={debouncedSearchQuery}
        currentMatchIndex={currentMatchIndex}
        onSearchResults={setSearchMatchCount}
        scrollContainerRef={
          scrollContainerRef as React.RefObject<HTMLDivElement>
        }
        media={media}
        commentedPathsByField={commentedPathsByField}
        externalExpansionState={advancedJsonExpansionState}
        onExpansionChange={onAdvancedJsonExpansionChange}
        theme={{ fontSize: "0.7rem", lineHeight: 14, indentSize: 12 }}
      />
    ) : null;

  if (isAdvanced)
    return isParsing ? (
      <div className="flex min-h-0 flex-1 flex-col border-t border-b">
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-foreground text-base">Parsing data...</div>
        </div>
      </div>
    ) : (
      <div className="ph-no-capture flex min-h-0 flex-1 flex-col border-t border-b">
        {correctionDiffDialog}
        {enableInlineComments && inlineCommentPositionRect && (
          <InlineCommentBubble
            positionRect={inlineCommentPositionRect}
            onAddComment={() => {
              if (selectionContext?.selection)
                onAddInlineComment?.(selectionContext.selection);
            }}
          />
        )}
        <div className="bg-background flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
          <Command className="flex-1 rounded-none border-0 bg-transparent">
            <CommandInput
              showBorder={false}
              placeholder="Search across all sections..."
              className="h-7 border-0 focus:ring-0"
              value={searchQuery}
              onValueChange={setSearchQuery}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (event.shiftKey) handlePreviousMatch();
                  else handleNextMatch();
                } else if (event.key === "Escape") handleClearSearch();
              }}
            />
          </Command>
          {searchQuery && (
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              {searchMatchCount > 0
                ? `${currentMatchIndex + 1} of ${searchMatchCount}`
                : "No matches"}
            </span>
          )}
          {searchQuery && searchMatchCount > 0 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handlePreviousMatch}
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp size="base" color="default" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNextMatch}
                title="Next match (Enter)"
              >
                <ChevronDown size="base" color="default" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={`String wrap mode: ${stringWrapMode}`}
            onClick={() => {
              if (stringWrapMode === "truncate") setStringWrapMode("wrap");
              else if (stringWrapMode === "wrap") setStringWrapMode("nowrap");
              else setStringWrapMode("truncate");
            }}
          >
            {wrapIcon}
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
              navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            }}
          >
            <Copy size="base" color="default" />
          </Button>
        </div>
        <div className="bg-background flex h-6 shrink-0 items-center gap-1.5 border-b px-2">
          <span className="text-muted-foreground text-xs">Jump to:</span>
          {sections.map((section, index) => (
            <span key={section.key} className="flex items-center">
              <button
                onClick={() => viewerRef.current?.scrollToSection(section.key)}
                className="text-primary cursor-pointer text-xs hover:underline"
              >
                {section.title}
              </button>
              {index < sections.length - 1 && (
                <span className="text-muted-foreground text-xs">,&nbsp;</span>
              )}
            </span>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto" ref={scrollContainerRef}>
          {enableInlineComments ? (
            <CommentableJsonView enabled>{viewerContent}</CommentableJsonView>
          ) : (
            viewerContent
          )}
        </div>
      </div>
    );

  return (
    <div className="space-y-2 pt-3">
      {correctionDiffDialog}
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

      {showData && allTools.length > 0 ? (
        <IOPreviewSection
          kind="tools"
          title="Tools"
          activeTab={activeToolTab}
          toolsProps={{ tools: visibleTools, toolCallsByName }}
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
        />
      ) : null}

      {isPretty && showData && skills && skills.items.length > 0 ? (
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
                {messagesToRender.map(
                  ({ message, originalIndex }, filteredIndex) => {
                    const isOutputMessage =
                      originalIndex >= (inputMessageCount ?? 0);
                    const sideTitle = isOutputMessage ? "Output" : "Input";
                    const folded =
                      foldsMiddle &&
                      filteredIndex > 0 &&
                      filteredIndex < foldEnd;
                    // Folded messages do not mount (no parsing) until the row opens.
                    if (folded && !othersOpen) return null;
                    const chatMessage = (
                      <IOPreviewSection
                        kind="message"
                        key={originalIndex}
                        title={
                          titleBySide ? sideTitle : getMessageTitle(message)
                        }
                        isOutputMessage={isOutputMessage}
                        messageProps={{
                          message,
                          shouldRenderMarkdown,
                          currentView: "pretty",
                          toolCallNumbers:
                            messageToToolCallNumbers.get(originalIndex),
                          contentMode,
                        }}
                        defaultCollapsed={
                          foldsMiddle
                            ? folded
                            : message.role !== "system" &&
                              filteredIndex <
                                messagesToRender.length - EXPANDED_TAIL_LENGTH
                        }
                        actions={
                          filteredIndex === lastOutputIndex
                            ? outputActions
                            : undefined
                        }
                      />
                    );
                    if (foldsMiddle && filteredIndex === 0) {
                      return (
                        <Fragment key={originalIndex}>
                          {chatMessage}
                          <button
                            type="button"
                            className="io-message-header text-muted-foreground focus-visible:ring-ring flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden"
                            aria-expanded={othersOpen}
                            aria-label={otherMessagesLabel}
                            onClick={() => setOthersOpen((open) => !open)}
                          >
                            <HistoryCaret
                              size="base"
                              color="default"
                              aria-hidden
                            />
                            {otherMessagesLabel}
                          </button>
                        </Fragment>
                      );
                    }
                    return chatMessage;
                  },
                )}
              </div>
              {showData && additionalInputToShow && (
                <IOPreviewSection
                  kind="json"
                  title="Additional Input"
                  jsonProps={{
                    json: additionalInputToShow,
                    currentView: shouldRenderMarkdown ? "pretty" : "json",
                  }}
                />
              )}
              {remainingMedia.length > 0 && (
                <IOPreviewSection
                  kind="media"
                  title="Media"
                  media={remainingMedia}
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
                    actions={field.key === "output" ? outputActions : undefined}
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
                    actions={field.key === "output" ? outputActions : undefined}
                    jsonProps={{
                      json: isJson ? field.raw : field.value,
                      parsedJson: isJson ? field.value : undefined,
                      isLoading,
                      isParsing,
                      media:
                        media?.filter((item) => item.field === field.key) ?? [],
                      currentView: isJson ? "json" : "pretty",
                      externalExpansionState: field.expansion,
                      onExternalExpansionChange: (expansion) => {
                        if (isJson) {
                          if (typeof expansion === "boolean")
                            field.onJsonExpansion?.(expansion);
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
      {(shouldRenderMessages || !showData) && correctedOutputField}
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
