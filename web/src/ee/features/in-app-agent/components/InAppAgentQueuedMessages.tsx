import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  CornerDownRight,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

export type InAppAgentQueuedMessageItem = {
  id: string;
  content: string;
};

export function InAppAgentQueuedMessages({
  messages,
  defaultExpanded = true,
  onEdit,
  onDelete,
  onReorder,
}: {
  messages: readonly InAppAgentQueuedMessageItem[];
  defaultExpanded?: boolean;
  onEdit: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onReorder?: (messageId: string, targetMessageId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (
      onReorder &&
      over &&
      active.id !== over.id &&
      typeof active.id === "string" &&
      typeof over.id === "string"
    ) {
      onReorder(active.id, over.id);
    }
  };

  return (
    <div className="border-border bg-card overflow-hidden rounded-md border">
      <button
        type="button"
        aria-expanded={isExpanded}
        className="hover:bg-muted/60 flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-bold"
        onClick={() => {
          setIsExpanded((current) => !current);
        }}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 transition-transform",
            !isExpanded && "-rotate-90",
          )}
        />
        {messages.length} queued
      </button>
      {isExpanded ? (
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          sensors={sensors}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={messages.map(({ id }) => id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="border-border divide-y border-t">
              {messages.map((message, index) => (
                <SortableQueuedMessage
                  key={message.id}
                  message={message}
                  index={index}
                  canReorder={Boolean(onReorder)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : null}
    </div>
  );
}

function SortableQueuedMessage({
  message,
  index,
  canReorder,
  onEdit,
  onDelete,
}: {
  message: InAppAgentQueuedMessageItem;
  index: number;
  canReorder: boolean;
  onEdit: (messageId: string) => void;
  onDelete: (messageId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: message.id, disabled: !canReorder });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-card flex gap-2 px-2 py-2",
        isDragging && "relative z-10 opacity-70 shadow-sm",
      )}
    >
      <CornerDownRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1 text-xs leading-5 wrap-break-word whitespace-pre-wrap">
        {message.content}
      </p>
      <div className="flex shrink-0 items-start gap-0.5">
        {canReorder ? (
          <Button
            {...attributes}
            {...listeners}
            type="button"
            variant="ghost"
            size="icon-xs"
            className="cursor-grab active:cursor-grabbing"
            aria-label={`Reorder queued message ${index + 1}`}
          >
            <GripVertical className="size-3" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Edit queued message ${index + 1}`}
          onClick={() => {
            onEdit(message.id);
          }}
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="hover:text-destructive"
          aria-label={`Delete queued message ${index + 1}`}
          onClick={() => {
            onDelete(message.id);
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </li>
  );
}
