import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { JsonPathInput } from "./JsonPathInput";
import { SourceFieldSelector } from "./SourceFieldSelector";
import type {
  CustomMappingConfig,
  SourceField,
  KeyValueMappingEntry,
  ObservationPreviewData,
  MappingTarget,
} from "../types";
import { isJsonPath } from "@langfuse/shared";

type CustomMappingEditorProps = {
  config: CustomMappingConfig;
  onChange: (config: CustomMappingConfig) => void;
  defaultSourceField: SourceField;
  observationData: ObservationPreviewData | null;
};

export function CustomMappingEditor({
  config,
  onChange,
  defaultSourceField,
  observationData,
}: CustomMappingEditorProps) {
  const handleTypeChange = (type: MappingTarget) => {
    if (type === "root") {
      onChange({
        type: "root",
        rootConfig: config.rootConfig ?? {
          sourceField: defaultSourceField,
          jsonPath: "$.",
        },
        keyValueMapConfig: config.keyValueMapConfig,
      });
    } else {
      onChange({
        type: "keyValueMap",
        rootConfig: config.rootConfig,
        keyValueMapConfig: config.keyValueMapConfig ?? {
          entries: [
            {
              id: crypto.randomUUID(),
              key: "value",
              sourceField: defaultSourceField,
              value: "$.",
            },
          ],
        },
      });
    }
  };

  const handleRootConfigChange = (
    field: "sourceField" | "jsonPath",
    value: string,
  ) => {
    onChange({
      ...config,
      rootConfig: {
        sourceField:
          field === "sourceField"
            ? (value as SourceField)
            : (config.rootConfig?.sourceField ?? defaultSourceField),
        jsonPath:
          field === "jsonPath" ? value : (config.rootConfig?.jsonPath ?? "$."),
      },
    });
  };

  const handleAddEntry = () => {
    const entries = config.keyValueMapConfig?.entries ?? [];
    const existingKeys = new Set(entries.map((e) => e.key));
    // Generate a unique default key
    let keyIndex = entries.length + 1;
    let newKey = `field_${keyIndex}`;
    while (existingKeys.has(newKey)) {
      keyIndex++;
      newKey = `field_${keyIndex}`;
    }
    onChange({
      ...config,
      keyValueMapConfig: {
        entries: [
          ...entries,
          {
            id: crypto.randomUUID(),
            key: newKey,
            sourceField: defaultSourceField,
            value: "$.",
          },
        ],
      },
    });
  };

  const handleRemoveEntry = (id: string) => {
    const entries = config.keyValueMapConfig?.entries ?? [];
    const entryToRemove = entries.find((e) => e.id === id);

    // Prevent removing required schema-derived entries
    if (entryToRemove?.fromSchema && entryToRemove?.isRequired) {
      return;
    }

    // Keep at least one entry (unless it's an empty schema-derived optional)
    const remainingEntries = entries.filter((e) => e.id !== id);
    if (remainingEntries.length < 1) return;

    onChange({
      ...config,
      keyValueMapConfig: {
        entries: remainingEntries,
      },
    });
  };

  const handleEntryChange = (
    id: string,
    field: keyof KeyValueMappingEntry,
    value: string,
  ) => {
    const entries = config.keyValueMapConfig?.entries ?? [];
    onChange({
      ...config,
      keyValueMapConfig: {
        entries: entries.map((e) =>
          e.id === id ? { ...e, [field]: value } : e,
        ),
      },
    });
  };

  const getSourceData = (sourceField: SourceField) => {
    if (!observationData) return null;
    return observationData[sourceField];
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-4">
      <div>
        <Label className="text-sm font-medium">Target</Label>
        <Tabs
          value={config.type}
          onValueChange={(v) => handleTypeChange(v as MappingTarget)}
          className="mt-2"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="root">Root</TabsTrigger>
            <TabsTrigger value="keyValueMap">Key-value map</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {config.type === "root" && (
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Source</Label>
            <div className="mt-1">
              <SourceFieldSelector
                value={config.rootConfig?.sourceField ?? defaultSourceField}
                onChange={(v) => handleRootConfigChange("sourceField", v)}
              />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">JSON Path</Label>
            <div className="mt-1">
              <JsonPathInput
                value={config.rootConfig?.jsonPath ?? "$."}
                onChange={(v) => handleRootConfigChange("jsonPath", v)}
                sourceData={getSourceData(
                  config.rootConfig?.sourceField ?? defaultSourceField,
                )}
                placeholder="$.path.to.field"
              />
            </div>
            <p className="p-1 text-xs text-muted-foreground">
              Start with $. to use a JSON path (e.g., $.field)
            </p>
          </div>
        </div>
      )}

      {config.type === "keyValueMap" && (
        <div className="max-h-[35vh] space-y-3 overflow-auto">
          <Label className="text-sm font-medium">Key-value mappings</Label>
          <p className="text-xs text-muted-foreground">
            Build an object with custom keys. Values starting with $ are treated
            as JSON paths.
          </p>

          <div className="space-y-3">
            {(config.keyValueMapConfig?.entries ?? []).map((entry) => {
              // Determine if this entry can be removed
              const isRequiredSchemaField =
                entry.fromSchema === true && entry.isRequired === true;
              const hasMultipleEntries =
                (config.keyValueMapConfig?.entries.length ?? 0) > 1;
              const canRemove = !isRequiredSchemaField && hasMultipleEntries;

              return (
                <KeyValueEntryRow
                  key={entry.id}
                  entry={entry}
                  onKeyChange={(key) => handleEntryChange(entry.id, "key", key)}
                  onSourceFieldChange={(sf) =>
                    handleEntryChange(entry.id, "sourceField", sf)
                  }
                  onValueChange={(value) =>
                    handleEntryChange(entry.id, "value", value)
                  }
                  onRemove={() => handleRemoveEntry(entry.id)}
                  canRemove={canRemove}
                  sourceData={getSourceData(entry.sourceField)}
                />
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleAddEntry}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add field
          </Button>
        </div>
      )}
    </div>
  );
}

type KeyValueEntryRowProps = {
  entry: KeyValueMappingEntry;
  onKeyChange: (key: string) => void;
  onSourceFieldChange: (sourceField: SourceField) => void;
  onValueChange: (value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  sourceData: unknown;
};

function KeyValueEntryRow({
  entry,
  onKeyChange,
  onSourceFieldChange,
  onValueChange,
  onRemove,
  canRemove,
  sourceData,
}: KeyValueEntryRowProps) {
  const isPath = isJsonPath(entry.value);
  const isSchemaField = entry.fromSchema === true;
  const isRequired = entry.isRequired === true;

  return (
    <div
      className={`space-y-2 rounded-md border bg-background p-3 ${
        isSchemaField ? "border-primary/30" : ""
      }`}
    >
      <div className="grid grid-cols-[1fr,auto] gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">
            Key
            {isRequired && <span className="ml-1 text-destructive">*</span>}
            {isSchemaField && (
              <span className="ml-2 text-primary">(from schema)</span>
            )}
          </Label>
          <Input
            value={entry.key}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder="field_name"
            className="mt-1 h-8"
            readOnly={isSchemaField}
            disabled={isSchemaField}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={!canRemove}
            className="h-8 w-8 p-0"
            title={
              isSchemaField && isRequired
                ? "Required schema field cannot be removed"
                : "Remove field"
            }
          >
            <Trash2
              className={`h-4 w-4 ${
                !canRemove
                  ? "text-muted-foreground/30"
                  : "text-muted-foreground"
              }`}
            />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[38fr,62fr] gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">Source</Label>
          <div className="mt-1">
            <SourceFieldSelector
              value={entry.sourceField}
              onChange={onSourceFieldChange}
              disabled={!isPath}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            Value {!isPath && "(literal)"}
          </Label>
          <div className="mt-1">
            {isPath ? (
              <JsonPathInput
                value={entry.value}
                onChange={onValueChange}
                sourceData={sourceData}
                placeholder="$.path"
                className="h-9"
              />
            ) : (
              <Input
                value={entry.value}
                onChange={(e) => onValueChange(e.target.value)}
                placeholder="literal value"
                className="h-9"
              />
            )}

            <p className="pt-1 text-xs text-muted-foreground">
              Start with $. to use a JSON path (e.g., $.field)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
