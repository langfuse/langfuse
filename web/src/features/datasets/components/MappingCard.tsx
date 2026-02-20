import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { InfoIcon, X } from "lucide-react";
import {
  type CsvColumnPreview,
  type FieldMapping,
} from "@/src/features/datasets/lib/csv/types";
import { isSchemaField } from "@/src/features/datasets/lib/csv/helpers";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

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
          "border-solid border-primary bg-background",
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
  input: FieldMapping;
  expectedOutput: FieldMapping;
  metadata: CsvColumnPreview[];
  onRemoveInputColumn: (columnName: string, key?: string) => void;
  onRemoveExpectedColumn: (columnName: string, key?: string) => void;
  onRemoveMetadataColumn: (columnName: string) => void;
  inputSchemaKeys: string[] | null;
  expectedOutputSchemaKeys: string[] | null;
  useDirectMappingForInput: boolean;
  useDirectMappingForExpectedOutput: boolean;
  onToggleDirectMappingForInput: (value: boolean) => void;
  onToggleDirectMappingForExpectedOutput: (value: boolean) => void;
};

export function MappingCard({
  input,
  expectedOutput,
  metadata,
  onRemoveInputColumn,
  onRemoveExpectedColumn,
  onRemoveMetadataColumn,
  inputSchemaKeys,
  expectedOutputSchemaKeys,
  useDirectMappingForInput,
  useDirectMappingForExpectedOutput,
  onToggleDirectMappingForInput,
  onToggleDirectMappingForExpectedOutput,
}: MappingCardProps) {
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground">
              Input
            </h3>
            {inputSchemaKeys && inputSchemaKeys.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Switch
                  id="direct-mapping-input"
                  checked={useDirectMappingForInput}
                  onCheckedChange={onToggleDirectMappingForInput}
                  className="scale-75"
                />
                <Label
                  htmlFor="direct-mapping-input"
                  className="cursor-pointer text-xs font-normal text-muted-foreground"
                >
                  Direct Mapping
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[250px]" side="left">
                    {useDirectMappingForInput
                      ? "Map entire CSV columns directly to the input field."
                      : "Map CSV columns to individual schema fields."}
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
          {isSchemaField(input) ? (
            <div className="space-y-2">
              {input.entries.map((entry) => (
                <SchemaKeyDropZone
                  key={entry.key}
                  schemaKey={entry.key}
                  mappedColumns={entry.columns}
                  parentId="input"
                  onRemove={(columnName) =>
                    onRemoveInputColumn(columnName, entry.key)
                  }
                />
              ))}
            </div>
          ) : (
            <FreeformDropZone
              id="input"
              columns={input.columns}
              onRemove={onRemoveInputColumn}
            />
          )}
        </div>

        {/* OUTPUT SECTION */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground">
              Expected Output
            </h3>
            {expectedOutputSchemaKeys &&
              expectedOutputSchemaKeys.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="direct-mapping-expected"
                    checked={useDirectMappingForExpectedOutput}
                    onCheckedChange={onToggleDirectMappingForExpectedOutput}
                    className="scale-75"
                  />
                  <Label
                    htmlFor="direct-mapping-expected"
                    className="cursor-pointer text-xs font-normal text-muted-foreground"
                  >
                    Direct mapping
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px]" side="left">
                      {useDirectMappingForExpectedOutput
                        ? "Map entire CSV columns directly to the expected output field."
                        : "Map CSV columns to individual schema fields."}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
          </div>
          {expectedOutput.type === "schema" ? (
            <div className="space-y-2">
              {expectedOutput.entries.map((entry) => (
                <SchemaKeyDropZone
                  key={entry.key}
                  schemaKey={entry.key}
                  mappedColumns={entry.columns}
                  parentId="expectedOutput"
                  onRemove={(columnName) =>
                    onRemoveExpectedColumn(columnName, entry.key)
                  }
                />
              ))}
            </div>
          ) : (
            <FreeformDropZone
              id="expected"
              columns={expectedOutput.columns}
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
            columns={metadata}
            onRemove={onRemoveMetadataColumn}
          />
        </div>
      </CardContent>
    </Card>
  );
}
