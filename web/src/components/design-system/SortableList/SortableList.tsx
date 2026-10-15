import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

function SortableRow({
  id,
  label,
  disabled,
  compact,
  variant,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  compact: boolean;
  variant: "plain" | "hover-card";
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const plainHandleHeight = compact ? "h-8" : "h-9";
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/sortable",
        variant === "hover-card"
          ? "hover:border-border focus-within:border-border relative rounded-md border border-transparent p-2"
          : "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-1",
        isDragging && "relative z-10 opacity-70",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={disabled}
        className={cn(
          "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex w-5 cursor-grab touch-none items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-hidden active:cursor-grabbing disabled:cursor-default disabled:opacity-30",
          variant === "hover-card"
            ? "absolute top-2 right-2 h-6 opacity-100 group-focus-within/sortable:opacity-100 group-hover/sortable:opacity-100 [@media(hover:hover)]:opacity-0"
            : plainHandleHeight,
        )}
        aria-label={`Reorder ${label}`}
        title="Drag to reorder. With a keyboard: Space to pick up or drop, arrow keys to move, Escape to cancel."
        {...attributes}
        {...listeners}
      >
        <GripVertical className="icon-base" />
      </button>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

/**
 * Vertical list whose rows reorder by dragging the grip (mouse, touch, or
 * keyboard). Rows are identified by `getId`; `onReorder` receives indices.
 */
export function SortableList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  renderItem,
  gap = "sm",
  variant = "plain",
  disabled = false,
  "aria-label": ariaLabel,
}: {
  items: T[];
  getId: (item: T, index: number) => string;
  getLabel: (item: T, index: number) => string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  /** Row spacing: `sm` for compact input rows, `md` for cards. */
  gap?: "sm" | "md";
  variant?: "plain" | "hover-card";
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    if (!isDragging) return;
    // Consume Escape before modal document listeners; the sensor still
    // receives the event and cancels the drag without discarding the dialog.
    const preventDialogDismissal = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    window.addEventListener("keydown", preventDialogDismissal, true);
    return () =>
      window.removeEventListener("keydown", preventDialogDismissal, true);
  }, [isDragging]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = items.map(getId);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setIsDragging(false);
    if (disabled || !over || active.id === over.id) return;
    const fromIndex = ids.indexOf(String(active.id));
    const toIndex = ids.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(fromIndex, toIndex);
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      sensors={sensors}
      onDragStart={() => setIsDragging(true)}
      onDragCancel={() => setIsDragging(false)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol
          aria-label={ariaLabel}
          className={cn("flex flex-col", gap === "md" ? "gap-4" : "gap-1.5")}
        >
          {items.map((item, index) => (
            <SortableRow
              key={ids[index]}
              id={ids[index]!}
              label={getLabel(item, index)}
              disabled={disabled || items.length < 2}
              compact={gap === "sm"}
              variant={variant}
            >
              {renderItem(item, index)}
            </SortableRow>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
