import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { type CsvColumnPreview } from "@/src/features/datasets/lib/csvHelpers";
import { cn } from "@/src/utils/tailwind";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { X } from "lucide-react";

function SchemaKeyDropZone({
  schemaKey,
  mappedColumns,
  parentId,
  onRemove,
}: {
  schemaKey: string;
  mappedColumns: CsvColumnPreview[];
  parentId: string;
  onRemove: (columnName: string) => void;
}) {
  const dropId = `${parentId}:${schemaKey}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[52px] rounded-md border border-dashed text-sm transition-colors",
        isOver &&
          mappedColumns.length === 0 &&
          "border-2 border-solid border-primary bg-background",
        mappedColumns.length > 0 &&
          "border-solid border-accent-dark-blue bg-light-blue/40",
      )}
    >
      {mappedColumns.length === 0 ? (
        <div className="flex h-full min-h-[52px] flex-col justify-start p-2">
          <div className="mb-1 text-sm font-medium">{schemaKey}</div>
        </div>
      ) : (
        <div className="p-2">
          <div className="mb-1 text-sm font-medium">{schemaKey}</div>
          <div className="flex flex-wrap gap-1.5">
            {mappedColumns.map((column) => (
              <MappedColumnBadge
                key={column.name}
                column={column}
                onRemove={onRemove}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FreeformDropZone({
  id,
  columns,
  onRemove,
}: {
  id: string;
  columns: CsvColumnPreview[];
  onRemove: (columnName: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[60px] rounded-md border border-dashed p-2 transition-colors",
        isOver &&
          columns.length === 0 &&
          "border border-solid border-primary bg-background",
        columns.length > 0 &&
          "border-solid border-accent-dark-blue bg-light-blue/40",
      )}
    >
      {columns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {columns.map((column) => (
            <MappedColumnBadge
              key={column.name}
              column={column}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MappedColumnBadge({
  column,
  onRemove,
}: {
  column: CsvColumnPreview;
  onRemove: (columnName: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `mapped-${column.name}`,
    data: {
      column,
      fromCardId: "mapped",
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group flex cursor-grab items-center gap-1 rounded-md bg-accent-dark-blue px-2 py-1 text-sm font-medium text-muted active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
      {...attributes}
    >
      <span {...listeners}>{column.name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(column.name);
        }}
        className="flex items-center rounded-sm hover:bg-accent-dark-blue/80"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

type MappingCardProps = {
  // Schema keys
  inputSchemaKeys?: string[];
  expectedOutputSchemaKeys?: string[];

  // Schema mappings (now supports multiple columns per key)
  inputSchemaMapping?: Map<string, CsvColumnPreview[]>;
  expectedOutputSchemaMapping?: Map<string, CsvColumnPreview[]>;

  // Freeform columns
  inputColumns: CsvColumnPreview[];
  expectedColumns: CsvColumnPreview[];
  metadataColumns: CsvColumnPreview[];

  // Remove handlers
  onRemoveInputColumn: (columnName: string) => void;
  onRemoveExpectedColumn: (columnName: string) => void;
  onRemoveMetadataColumn: (columnName: string) => void;
  onRemoveInputSchemaColumn: (schemaKey: string, columnName: string) => void;
  onRemoveExpectedSchemaColumn: (schemaKey: string, columnName: string) => void;
};

export function MappingCard({
  inputSchemaKeys,
  expectedOutputSchemaKeys,
  inputSchemaMapping,
  expectedOutputSchemaMapping,
  inputColumns,
  expectedColumns,
  metadataColumns,
  onRemoveInputColumn,
  onRemoveExpectedColumn,
  onRemoveMetadataColumn,
  onRemoveInputSchemaColumn,
  onRemoveExpectedSchemaColumn,
}: MappingCardProps) {
  const hasInputSchema = inputSchemaKeys && inputSchemaKeys.length > 0;
  const hasExpectedSchema =
    expectedOutputSchemaKeys && expectedOutputSchemaKeys.length > 0;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="shrink-0 border-b p-3">
        <CardTitle className="text-base font-semibold">
          Map to Dataset Items
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {/* INPUT SECTION */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground">
            Input
          </h3>
          {hasInputSchema ? (
            <div className="space-y-2">
              {inputSchemaKeys.map((schemaKey) => (
                <SchemaKeyDropZone
                  key={schemaKey}
                  schemaKey={schemaKey}
                  mappedColumns={inputSchemaMapping?.get(schemaKey) ?? []}
                  parentId="input"
                  onRemove={(columnName) =>
                    onRemoveInputSchemaColumn(schemaKey, columnName)
                  }
                />
              ))}
            </div>
          ) : (
            <FreeformDropZone
              id="input"
              columns={inputColumns}
              onRemove={onRemoveInputColumn}
            />
          )}
        </div>

        {/* OUTPUT SECTION */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground">
            Output
          </h3>
          {hasExpectedSchema ? (
            <div className="space-y-2">
              {expectedOutputSchemaKeys.map((schemaKey) => (
                <SchemaKeyDropZone
                  key={schemaKey}
                  schemaKey={schemaKey}
                  mappedColumns={
                    expectedOutputSchemaMapping?.get(schemaKey) ?? []
                  }
                  parentId="expectedOutput"
                  onRemove={(columnName) =>
                    onRemoveExpectedSchemaColumn(schemaKey, columnName)
                  }
                />
              ))}
            </div>
          ) : (
            <FreeformDropZone
              id="expected"
              columns={expectedColumns}
              onRemove={onRemoveExpectedColumn}
            />
          )}
        </div>

        {/* METADATA SECTION */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground">
            Metadata
          </h3>
          <FreeformDropZone
            id="metadata"
            columns={metadataColumns}
            onRemove={onRemoveMetadataColumn}
          />
        </div>
      </CardContent>
    </Card>
  );
}
