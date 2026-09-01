import { Fragment, useState, type CSSProperties } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  GripVertical,
  MoreVertical,
  Plus,
  Trash2,
  TriangleAlert,
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
import { preparePromptEditorState } from "@/src/features/evals/v2/fns/promptEditor/preparePromptEditorState";
import {
  EMPTY_PROMPT_MESSAGE_ERROR,
  INVALID_SYSTEM_PROMPT_MESSAGE_ERROR,
} from "@/src/features/evals/v2/fns/promptMessages/hasInvalidSystemPromptMessage";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { cn } from "@/src/utils/tailwind";
import type { EvaluatorPromptMessage } from "@langfuse/shared";

const ROLES: Array<{ value: EvaluatorPromptMessage["role"]; label: string }> = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
];

type PreparedPromptEditorState = ReturnType<typeof preparePromptEditorState>;

export function PromptEditor({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const sampleObject = useEvaluatorSetupSample({ projectId, store });
  return <PromptEditorContent store={store} sampleObject={sampleObject} />;
}

/** Presentational prompt editor used by the connected editor and Storybook. */
export function PromptEditorContent({
  store,
  sampleObject,
}: {
  store: EvaluatorSetupStore;
  sampleObject: Record<string, unknown> | null;
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
      <div className="flex flex-col gap-2">
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
              onPreviewEnabledChange={state.actions.setPromptPreviewEnabled}
              onChange={(next) => state.actions.setPromptMessage(index, next)}
              onRemove={() => state.actions.removePromptMessage(index)}
            />
          ))}
        </SortableContext>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-foreground hover:text-foreground h-6 w-full justify-start gap-1.5 px-0 py-0 text-xs leading-none underline-offset-4 hover:bg-transparent hover:underline"
          onClick={() => {
            state.actions.setPromptPreviewEnabled(false);
            state.actions.addPromptMessage();
          }}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          Add message
        </Button>
      </div>
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
  onPreviewEnabledChange,
  onChange,
  onRemove,
}: {
  id: string;
  index: number;
  messageCount: number;
  message: EvaluatorPromptMessage;
  combinedPrepared: PreparedPromptEditorState;
  prepared: PreparedPromptEditorState;
  previewEnabled: boolean;
  onPreviewEnabledChange: (enabled: boolean) => void;
  onChange: (message: EvaluatorPromptMessage) => void;
  onRemove: () => void;
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
        showPreviewToggle
        previewEnabled={previewEnabled}
        onPreviewEnabledChange={onPreviewEnabledChange}
        previewDisabledReason={combinedPrepared.promptPreviewDisabledReason}
        preview={prepared.promptPreview}
        renderPreviewText={renderMediaAwareText}
        collapsed={!expanded}
        toolbarStart={
          <>
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
            {messageCount > 1 || message.role !== "user" || warningReason ? (
              warningReason ? (
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
              )
            ) : null}
            {!expanded ? (
              <span
                className="text-muted-foreground min-w-0 flex-1 truncate px-1 text-xs leading-none"
                title={message.content || "Empty message"}
              >
                {message.content || "Empty message"}
              </span>
            ) : null}
          </>
        }
        onToolbarClick={() => setExpanded((current) => !current)}
        toolbarActions={
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
                    onSelect={() => onChange({ ...message, role: role.value })}
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
