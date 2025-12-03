import DocPopup from "@/src/components/layouts/doc-popup";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { type UniqueIdentifier } from "@dnd-kit/core";
import type { CsvColumnPreview } from "@/src/features/datasets/lib/csv/types";

type ImportCardProps = {
  title: string;
  columns: CsvColumnPreview[];
  onColumnSelect: (columnName: string) => void;
  onColumnRemove: (columnName: string) => void;
  id: UniqueIdentifier;
  className?: string;
  info?: string;
  schemaKeys?: string[]; // Schema-driven mode
  schemaKeyMapping?: Map<string, string>; // {schemaKey: csvColumn}
  onSchemaKeyMap?: (schemaKey: string, csvColumn: string) => void;
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
        "cursor-grab rounded-md border p-2 hover:bg-accent active:cursor-grabbing",
        isDragging && "opacity-30",
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

function SchemaKeyDropZone({
  schemaKey,
  mappedColumn,
  parentId,
}: {
  schemaKey: string;
  mappedColumn?: string;
  parentId: UniqueIdentifier;
}) {
  const dropId = `${parentId}:${schemaKey}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md border border-dashed p-2 text-sm",
        isOver && "border-primary bg-accent/50",
        mappedColumn ? "bg-accent/20" : "bg-background",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{schemaKey}</span>
        {mappedColumn && (
          <span className="text-xs text-muted-foreground">{mappedColumn}</span>
        )}
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
  schemaKeys,
  schemaKeyMapping,
}: ImportCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  const isSchemaMode = schemaKeys && schemaKeys.length > 0;

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "flex h-full flex-col overflow-hidden",
        !isSchemaMode && isOver && "ring-2 ring-primary",
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
        {isSchemaMode ? (
          // Schema-driven mode: show schema keys as drop zones
          <>
            {schemaKeys.map((schemaKey) => (
              <SchemaKeyDropZone
                key={schemaKey}
                schemaKey={schemaKey}
                mappedColumn={schemaKeyMapping?.get(schemaKey)}
                parentId={id}
              />
            ))}
          </>
        ) : (
          // Freeform mode: show draggable columns
          <>
            {columns.length === 0 && id !== "unmapped" ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Drag columns here
              </div>
            ) : (
              columns.map((column) => (
                <DraggableColumn
                  key={column.name}
                  column={column}
                  parentId={id}
                />
              ))
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
