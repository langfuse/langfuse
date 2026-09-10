import {
  Fragment,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  Copy,
  GripVertical,
  MoreVertical,
  Plus,
  Trash2,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { MediaReferenceTag } from "@/src/components/ui/media/MediaReferenceTag";
import { splitStringByMediaReferences } from "@/src/components/ui/media/mediaUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { PromptVariableEditor } from "@/src/features/evals/v2/components/Evaluators/Judges/PromptVariableEditor/PromptVariableEditor";
import { EvaluatorAssistantEditDialog } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/EvaluatorAssistantEditDialog";
import { preparePromptEditorState } from "@/src/features/evals/v2/fns/promptEditor/preparePromptEditorState";
import {
  EMPTY_PROMPT_MESSAGE_ERROR,
  INVALID_SYSTEM_PROMPT_MESSAGE_ERROR,
} from "@/src/features/evals/v2/fns/promptMessages/hasInvalidSystemPromptMessage";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useIsInAppAgentLauncherVisible } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { InAppAgentUpdateHighlight } from "@/src/features/in-app-agent";
import { useEvaluatorAssistantPromptUpdateSignal } from "@/src/features/evals/v2/store/evaluatorAssistantUpdateSignalStore";
import { cn } from "@/src/utils/tailwind";
import type { EvaluatorPromptMessage } from "@langfuse/shared";

const ROLES: Array<{ value: EvaluatorPromptMessage["role"]; label: string }> = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
];

const PROMPT_MESSAGE_PLACEHOLDER =
  "Describe what the judge should evaluate. Use {{variable}} to include sample data.";

type PreparedPromptEditorState = ReturnType<typeof preparePromptEditorState>;

export function PromptEditor({
  projectId,
  evaluatorId,
  store,
  onAssistantSubmit,
}: {
  projectId: string;
  evaluatorId: string;
  store: EvaluatorSetupStore;
  onAssistantSubmit?: (request: string) => Promise<boolean>;
}) {
  const sampleObject = useEvaluatorSetupSample({ projectId, store });
  const isAssistantLauncherVisible = useIsInAppAgentLauncherVisible();
  const promptUpdateId = useEvaluatorAssistantPromptUpdateSignal(
    projectId,
    evaluatorId,
  );
  return (
    <InAppAgentUpdateHighlight updateId={promptUpdateId}>
      <PromptEditorContent
        store={store}
        sampleObject={sampleObject}
        onAssistantSubmit={
          isAssistantLauncherVisible ? onAssistantSubmit : undefined
        }
      />
    </InAppAgentUpdateHighlight>
  );
}

/** Presentational prompt editor used by the connected editor and Storybook. */
export function PromptEditorContent({
  store,
  sampleObject,
  onAssistantSubmit,
}: {
  store: EvaluatorSetupStore;
  sampleObject: Record<string, unknown> | null;
  onAssistantSubmit?: (request: string) => Promise<boolean>;
}) {
  const state = useStore(
    store,
    useShallow((state) => ({
      promptMessages: state.promptMessages,
      promptMessageIds: state.promptMessageIds,
      variableFields: state.variableFields,
      promptPreviewEnabled: state.promptPreviewEnabled,
      actions: state.actions,
    })),
  );
  const combinedPrompt = state.promptMessages
    .map(({ content }) => content)
    .join("\n\n");
  const combinedPrepared = preparePromptEditorState({
    prompt: combinedPrompt,
    variableFields: state.variableFields,
    promptPreviewEnabled: state.promptPreviewEnabled,
    sampleObject,
  });
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [assistantDialogOpen, setAssistantDialogOpen] = useState(false);
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);
  const previewDisabledDescriptionId = useId();
  const activeMessageIndex = activeMessageId
    ? state.promptMessageIds.indexOf(activeMessageId)
    : -1;
  const activeMessage =
    activeMessageIndex >= 0 ? state.promptMessages[activeMessageIndex] : null;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor),
  );
  const isSingleMessage = state.promptMessages.length === 1;
  const assistantAction = onAssistantSubmit ? (
    <button
      ref={assistantTriggerRef}
      type="button"
      aria-haspopup="dialog"
      aria-label={isSingleMessage ? "Edit with AI" : undefined}
      title={isSingleMessage ? "Edit with AI" : undefined}
      className={cn(
        "bg-background text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent ring-offset-background focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 font-sans text-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
        isSingleMessage && "h-6 w-6 justify-center p-0",
      )}
      onClick={() => setAssistantDialogOpen(true)}
    >
      <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" />
      {isSingleMessage ? null : "Edit with AI"}
    </button>
  ) : null;
  const previewAction = (
    <>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <label
            className={cn(
              "text-muted-foreground flex h-6 items-center gap-1.5 px-2 text-xs",
              isSingleMessage && "px-1",
              combinedPrepared.promptPreviewDisabledReason
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer",
            )}
            title={isSingleMessage ? "Preview" : undefined}
            tabIndex={
              combinedPrepared.promptPreviewDisabledReason ? 0 : undefined
            }
            aria-disabled={Boolean(
              combinedPrepared.promptPreviewDisabledReason,
            )}
            aria-describedby={
              combinedPrepared.promptPreviewDisabledReason
                ? previewDisabledDescriptionId
                : undefined
            }
          >
            <Switch
              size="sm"
              checked={state.promptPreviewEnabled}
              disabled={Boolean(combinedPrepared.promptPreviewDisabledReason)}
              onCheckedChange={state.actions.setPromptPreviewEnabled}
            />
            <span className={cn(isSingleMessage && "sr-only")}>Preview</span>
          </label>
        </TooltipTrigger>
        {combinedPrepared.promptPreviewDisabledReason ? (
          <TooltipContent>
            {combinedPrepared.promptPreviewDisabledReason}
          </TooltipContent>
        ) : null}
      </Tooltip>
      {combinedPrepared.promptPreviewDisabledReason ? (
        <span id={previewDisabledDescriptionId} className="sr-only">
          {combinedPrepared.promptPreviewDisabledReason}
        </span>
      ) : null}
    </>
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveMessageId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveMessageId(null);
    if (!over || active.id === over.id) return;
    const fromIndex = state.promptMessageIds.indexOf(String(active.id));
    const toIndex = state.promptMessageIds.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    state.actions.reorderPromptMessage(fromIndex, toIndex);
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveMessageId(null)}
      onDragEnd={handleDragEnd}
    >
      <div
        className={cn(
          "bg-secondary text-secondary-foreground rounded-md border",
          isSingleMessage && "overflow-hidden",
        )}
      >
        {!isSingleMessage ? (
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-t-md border-b px-2">
            <span className="text-muted-foreground text-xs">
              {state.promptMessages.length} messages
            </span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {assistantAction}
              {previewAction}
            </div>
          </div>
        ) : null}
        <div className="flex flex-col">
          <SortableContext
            items={state.promptMessageIds}
            strategy={verticalListSortingStrategy}
          >
            {state.promptMessages.map((message, index) => (
              <SortablePromptMessage
                key={state.promptMessageIds[index]}
                id={state.promptMessageIds[index]}
                index={index}
                messageCount={state.promptMessages.length}
                message={message}
                combinedPrepared={combinedPrepared}
                prepared={preparePromptEditorState({
                  prompt: message.content,
                  variableFields: state.variableFields,
                  promptPreviewEnabled: state.promptPreviewEnabled,
                  sampleObject,
                })}
                previewEnabled={state.promptPreviewEnabled}
                onChange={(next) => state.actions.setPromptMessage(index, next)}
                onRemove={() => state.actions.removePromptMessage(index)}
                toolbarPrefix={
                  isSingleMessage ? (
                    <span className="text-muted-foreground shrink-0 text-[10px]">
                      1 message
                    </span>
                  ) : null
                }
                toolbarActionsBeforeMenu={
                  isSingleMessage ? (
                    <>
                      {assistantAction}
                      {previewAction}
                    </>
                  ) : null
                }
                toolbarVariant={isSingleMessage ? "group" : "message"}
              />
            ))}
          </SortableContext>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-foreground hover:text-foreground mt-2 h-6 w-full justify-start gap-1.5 px-0 py-0 text-xs leading-none underline-offset-4 hover:bg-transparent hover:underline"
        onClick={() => {
          state.actions.setPromptPreviewEnabled(false);
          state.actions.addPromptMessage();
        }}
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        Add message
      </Button>
      <DragOverlay dropAnimation={null}>
        {activeMessage ? (
          <div
            data-testid="prompt-message-drag-preview"
            aria-hidden="true"
            className="bg-secondary text-secondary-foreground flex h-9 w-full items-center gap-2 rounded-md border px-2 shadow-lg"
          >
            <Badge variant="tertiary" size="sm" className="h-5 shrink-0">
              {ROLES.find((role) => role.value === activeMessage.role)?.label}
            </Badge>
            <span
              className="min-w-0 truncate text-xs"
              title={activeMessage.content || "Empty message"}
            >
              {activeMessage.content || "Empty message"}
            </span>
          </div>
        ) : null}
      </DragOverlay>
      {onAssistantSubmit ? (
        <EvaluatorAssistantEditDialog
          open={assistantDialogOpen}
          evaluatorType="judge"
          returnFocusRef={assistantTriggerRef}
          onOpenChange={setAssistantDialogOpen}
          onAssistantSubmit={onAssistantSubmit}
        />
      ) : null}
    </DndContext>
  );
}

function SortablePromptMessage({
  id,
  index,
  messageCount,
  message,
  combinedPrepared,
  prepared,
  previewEnabled,
  onChange,
  onRemove,
  toolbarPrefix,
  toolbarActionsBeforeMenu,
  toolbarVariant,
}: {
  id: string;
  index: number;
  messageCount: number;
  message: EvaluatorPromptMessage;
  combinedPrepared: PreparedPromptEditorState;
  prepared: PreparedPromptEditorState;
  previewEnabled: boolean;
  onChange: (message: EvaluatorPromptMessage) => void;
  onRemove: () => void;
  toolbarPrefix?: ReactNode;
  toolbarActionsBeforeMenu?: ReactNode;
  toolbarVariant: "message" | "group";
}) {
  const [expanded, setExpanded] = useState(true);
  const { copy } = useCopyToClipboard();
  const hasEmptyContent = message.content.trim().length === 0;
  const hasInvalidSystemRole = index > 0 && message.role === "system";
  const warningReason = [
    hasEmptyContent ? EMPTY_PROMPT_MESSAGE_ERROR : null,
    hasInvalidSystemRole ? INVALID_SYSTEM_PROMPT_MESSAGE_ERROR : null,
  ]
    .filter(Boolean)
    .join(" ");
  const roleBadge = (
    <Badge
      variant="tertiary"
      size="sm"
      className="h-5 shrink-0 gap-1 leading-none"
    >
      {warningReason ? (
        <TriangleAlert
          className="text-dark-yellow h-3.5 w-3.5"
          aria-label={
            hasEmptyContent
              ? "Empty prompt message"
              : "Invalid system message position"
          }
        />
      ) : null}
      {ROLES.find((role) => role.value === message.role)?.label}
    </Badge>
  );
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: messageCount === 1 });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/prompt-message relative",
        isDragging && "z-10 opacity-0",
      )}
    >
      {messageCount > 1 ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-full flex w-7 cursor-grab touch-none items-start justify-center pt-2 opacity-0 transition-opacity group-hover/prompt-message:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          aria-label={`Reorder ${message.role} prompt message`}
          title="Drag to reorder message"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <PromptVariableEditor
        value={message.content}
        onChange={(content) => onChange({ ...message, content })}
        variableStatus={combinedPrepared.promptVariableStatus}
        variableMappings={combinedPrepared.promptVariableMappings}
        previewEnabled={previewEnabled}
        preview={prepared.promptPreview}
        renderPreviewText={renderMediaAwareText}
        collapsed={!expanded}
        surfaceVariant={index === messageCount - 1 ? "nested-last" : "nested"}
        placeholder={PROMPT_MESSAGE_PLACEHOLDER}
        toolbarVariant={toolbarVariant}
        toolbarStart={
          <>
            {toolbarPrefix}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              aria-expanded={expanded}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${message.role} prompt message`}
              title={`${expanded ? "Collapse" : "Expand"} prompt message`}
              onClick={() => setExpanded((current) => !current)}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  !expanded && "-translate-x-0.5 -rotate-90",
                )}
              />
            </Button>
            {warningReason ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <span className="inline-flex" tabIndex={0}>
                    {roleBadge}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{warningReason}</TooltipContent>
              </Tooltip>
            ) : (
              roleBadge
            )}
            {!expanded ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <span
                    className="text-muted-foreground min-w-0 flex-1 cursor-help truncate px-1 text-xs leading-none"
                    tabIndex={0}
                    title={message.content || "Empty message"}
                  >
                    {message.content || "Empty message"}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="ph-no-capture max-w-sm break-words whitespace-pre-wrap">
                  {message.content || "Empty message"}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </>
        }
        onToolbarClick={() => setExpanded((current) => !current)}
        toolbarActions={
          <>
            {toolbarActionsBeforeMenu}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Prompt message settings"
                  title="Prompt message settings"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[10px] font-bold tracking-wider uppercase">
                  Role
                </DropdownMenuLabel>
                {ROLES.map((role) => {
                  const disabledReason =
                    index > 0 && role.value === "system"
                      ? INVALID_SYSTEM_PROMPT_MESSAGE_ERROR
                      : null;
                  return (
                    <DropdownMenuItem
                      key={role.value}
                      disabled={Boolean(disabledReason)}
                      allowPointerEventsWhenDisabled={Boolean(disabledReason)}
                      title={disabledReason ?? undefined}
                      onSelect={() =>
                        onChange({ ...message, role: role.value })
                      }
                    >
                      <span className="flex-1">{role.label}</span>
                      {message.role === role.value ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    copy(message.content).catch(() => undefined);
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy prompt
                </DropdownMenuItem>
                {messageCount > 1 ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={onRemove}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete message
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
    </div>
  );
}

function renderMediaAwareText(value: string) {
  return splitStringByMediaReferences(value).map((segment, index) =>
    segment.type === "media" ? (
      <span key={`${segment.value}-${index}`} className="inline-flex">
        <MediaReferenceTag descriptor={segment.descriptor} />
      </span>
    ) : (
      <Fragment key={index}>{segment.value}</Fragment>
    ),
  );
}
