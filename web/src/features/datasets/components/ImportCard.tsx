import DocPopup from "@/src/components/layouts/doc-popup";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { type CsvColumnPreview } from "@/src/features/datasets/lib/csvHelpers";
import { cn } from "@/src/utils/tailwind";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { type UniqueIdentifier } from "@dnd-kit/core";

type ImportCardProps = {
  title: string;
  columns: CsvColumnPreview[];
  onColumnSelect: (columnName: string) => void;
  onColumnRemove: (columnName: string) => void;
  id: UniqueIdentifier;
  className?: string;
  info?: string;
};

function DraggableColumn({
  column,
  parentId,
}: {
  column: CsvColumnPreview;
  parentId: UniqueIdentifier;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: column.name,
    data: {
      column,
      fromCardId: parentId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded-md border p-2 hover:bg-accent",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between space-x-1">
        <span className="text-sm">{column.name}</span>
        <span className="text-xs text-muted-foreground">
          {column.inferredType}
        </span>
      </div>
    </div>
  );
}

export function ImportCard({
  title,
  columns,
  id,
  className,
  info,
}: ImportCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "flex h-full flex-col overflow-hidden",
        isOver && "ring-2 ring-primary",
        className,
      )}
    >
      <CardHeader className="shrink-0 p-4 pb-2">
        <CardTitle className="text-lg font-semibold">
          {title}
          {info && <DocPopup description={info} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4 pt-2">
        {columns.map((column) => (
          <DraggableColumn key={column.name} column={column} parentId={id} />
        ))}
      </CardContent>
    </Card>
  );
}
