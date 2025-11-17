import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { CsvColumnPreview } from "@/src/features/datasets/lib/csv/types";

function DraggableColumn({ column }: { column: CsvColumnPreview }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: column.name,
    data: {
      column,
      fromCardId: "csv-columns",
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "group flex cursor-grab items-center gap-2 rounded-md border bg-background p-2 hover:border-primary hover:bg-accent active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/70 group-hover:text-primary" />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-sm">{column.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {column.inferredType}
        </span>
      </div>
    </div>
  );
}

export function CsvColumnsCard({
  columns,
  columnCount,
}: {
  columns: CsvColumnPreview[];
  columnCount: number;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="shrink-0 p-4 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">CSV Columns</CardTitle>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {columnCount} {columnCount === 1 ? "column" : "columns"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4 pt-0">
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {columns.map((column) => (
            <DraggableColumn key={column.name} column={column} />
          ))}
        </div>
        <div className="shrink-0 rounded-lg bg-light-blue/40 p-3 text-xs leading-relaxed text-accent-dark-blue">
          <strong className="font-semibold">Tip:</strong> Drag columns from this
          list to the mapping fields on the right.
        </div>
      </CardContent>
    </Card>
  );
}
