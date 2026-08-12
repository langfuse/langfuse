// CIP fork feature (see FORK.md): the builder's page list — one field is one
// page/screen. Grouped add-menu (heyform BLOCK_GROUPS style), @dnd-kit
// reordering, duplicate/delete per page.
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { cn } from "@/src/utils/tailwind";
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  Copy,
  Flag,
  GitCompare,
  Grid3X3,
  GripVertical,
  Hash,
  Heart,
  Image,
  List,
  ListOrdered,
  Megaphone,
  MessageCircleQuestion,
  MessageSquareText,
  MoreHorizontal,
  PartyPopper,
  Plus,
  Star,
  Text,
  ThumbsUp,
  ToggleLeft,
  Trash2,
  Vote,
} from "lucide-react";
import { type Dispatch } from "react";
import {
  FIELD_KIND_GROUPS,
  FIELD_KIND_LABELS,
  isStatementField,
  type FieldKind,
  type FormField,
} from "../../lib/contract";
import { type BuilderAction } from "./builder-state";

export const FIELD_KIND_ICONS: Record<FieldKind, React.ElementType> = {
  welcome: Flag,
  statement: MessageSquareText,
  thank_you: PartyPopper,
  short_text: Text,
  long_text: AlignLeft,
  number: Hash,
  multiple_choice: CheckSquare,
  picture_choice: Image,
  yes_no: ToggleLeft,
  dropdown: List,
  rating: Star,
  opinion_scale: ThumbsUp,
  date: Calendar,
  matrix: Grid3X3,
  ranking: ListOrdered,
  statement_voting: Vote,
  ai_interview: MessageCircleQuestion,
  response_comparison: GitCompare,
  stimulus_rating: Heart,
  crowdpoll: Megaphone,
};

function SortablePageItem({
  field,
  index,
  questionNumber,
  selected,
  dispatch,
  canDelete,
}: {
  field: FormField;
  index: number;
  questionNumber: number | null;
  selected: boolean;
  dispatch: Dispatch<BuilderAction>;
  canDelete: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });
  const Icon = FIELD_KIND_ICONS[field.kind];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-1 rounded-md border p-2 text-sm",
        selected
          ? "border-primary/50 bg-primary/5"
          : "border-transparent hover:bg-muted/50",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/50 opacity-0 group-hover:opacity-100"
        aria-label={`Reorder page ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => dispatch({ type: "select", id: field.id })}
      >
        <span className="flex h-6 w-8 shrink-0 items-center justify-center gap-0.5 rounded bg-muted text-[10px] font-medium text-muted-foreground">
          <Icon className="h-3 w-3" />
          {questionNumber !== null && questionNumber}
        </span>
        <span className="truncate">
          {field.title || FIELD_KIND_LABELS[field.kind]}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            <span className="sr-only">Page actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuItem
            onClick={() => dispatch({ type: "duplicateField", id: field.id })}
          >
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={!canDelete}
            onClick={() => dispatch({ type: "removeField", id: field.id })}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function BuilderLeftPanel({
  fields,
  selectedId,
  dispatch,
}: {
  fields: FormField[];
  selectedId: string | null;
  dispatch: Dispatch<BuilderAction>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = fields.map((f) => f.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    dispatch({ type: "reorder", ids });
  };

  let questionNumber = 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-2 pl-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pages
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2">
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-96 overflow-y-auto"
          >
            {FIELD_KIND_GROUPS.map((group, i) => (
              <DropdownMenuGroup key={group.label}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {group.label}
                </DropdownMenuLabel>
                {group.kinds.map((kind) => {
                  const Icon = FIELD_KIND_ICONS[kind];
                  return (
                    <DropdownMenuItem
                      key={kind}
                      onClick={() => dispatch({ type: "addField", kind })}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {FIELD_KIND_LABELS[kind]}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1">
              {fields.map((field, index) => {
                if (!isStatementField(field.kind)) questionNumber += 1;
                return (
                  <SortablePageItem
                    key={field.id}
                    field={field}
                    index={index}
                    questionNumber={
                      isStatementField(field.kind) ? null : questionNumber
                    }
                    selected={field.id === selectedId}
                    dispatch={dispatch}
                    canDelete={fields.length > 1}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
