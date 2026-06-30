import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  type ColumnDefinition,
  type FilterState,
  type ObservationIoParserSourceRepresentation,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { cn } from "@/src/utils/tailwind";
import {
  getParserSourceOptions,
  newFieldDraft,
  type ParserDraft,
  type ParserFieldDraft,
} from "@/src/features/observation-io-parsers/lib/parserDraft";

const sourceLabels: Record<ParserFieldDraft["source"], string> = {
  conversation: "All messages",
  input: "Input",
  output: "Output",
  metadata: "Metadata",
};

export function ParserDraftForm({
  draft,
  parserFilterColumns,
  onChange,
}: {
  draft: ParserDraft;
  parserFilterColumns: ColumnDefinition[];
  onChange: (draft: ParserDraft) => void;
}) {
  const columnsWithCustomSelect = useMemo(
    () =>
      parserFilterColumns
        .filter(
          (column) =>
            column.type === "stringOptions" ||
            column.type === "arrayOptions" ||
            column.type === "categoryOptions",
        )
        .map((column) => column.id),
    [parserFilterColumns],
  );

  const updateField = (index: number, field: ParserFieldDraft) => {
    const fields = [...draft.fields];
    fields[index] = field;
    onChange({ ...draft, fields });
  };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_5rem]">
        <label className="grid gap-1">
          <span className="text-xs font-medium">Name</span>
          <Input
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
          />
        </label>
        <div className="flex items-end justify-between gap-2 pb-1">
          <span className="text-xs font-medium">Enabled</span>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
          />
        </div>
      </div>

      <label className="grid gap-1">
        <span className="text-xs font-medium">Description</span>
        <Input
          value={draft.description}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value })
          }
        />
      </label>

      <div className="grid gap-1">
        <span className="text-xs font-medium">Filters</span>
        <InlineFilterBuilder
          columnIdentifier="id"
          columns={parserFilterColumns}
          filterState={draft.filters}
          onChange={(filters: FilterState) => onChange({ ...draft, filters })}
          columnsWithCustomSelect={columnsWithCustomSelect}
        />
      </div>

      <div className="grid gap-3 border-t pt-4">
        <label className="grid gap-1 md:max-w-xs">
          <span className="text-xs font-medium">Source</span>
          <Select
            value={draft.sourceRepresentation}
            onValueChange={(value) => {
              const sourceRepresentation =
                value as ObservationIoParserSourceRepresentation;
              const fields = draft.fields.map((field) =>
                sourceRepresentation === "raw_json" &&
                field.source === "conversation"
                  ? {
                      ...field,
                      source: "output" as const,
                      jsonPath:
                        field.jsonPath === "$.lastText"
                          ? "$.quality"
                          : field.jsonPath,
                    }
                  : field,
              );

              onChange({
                ...draft,
                sourceRepresentation,
                fields,
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normalized_chat">Normalized chat</SelectItem>
              <SelectItem value="raw_json">Raw JSON</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Fields</span>
          <Button
            variant="outline"
            size="xs"
            className="gap-1"
            onClick={() =>
              onChange({
                ...draft,
                fields: [
                  ...draft.fields,
                  newFieldDraft(draft.sourceRepresentation),
                ],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Field
          </Button>
        </div>

        {draft.fields.map((field, index) => (
          <div key={field.id} className="grid gap-2 rounded-md border p-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[8rem_1fr_auto]">
              <Select
                value={field.source}
                onValueChange={(source) =>
                  updateField(index, {
                    ...field,
                    source: source as ParserFieldDraft["source"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getParserSourceOptions(draft.sourceRepresentation).map(
                    (source) => (
                      <SelectItem key={source} value={source}>
                        {sourceLabels[source]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <Input
                className="font-mono text-xs"
                value={field.jsonPath}
                placeholder="$.answer"
                onChange={(event) =>
                  updateField(index, {
                    ...field,
                    jsonPath: event.target.value,
                  })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  draft.fields.length === 1 && "invisible",
                )}
                onClick={() =>
                  onChange({
                    ...draft,
                    fields: draft.fields.filter(
                      (candidate) => candidate.id !== field.id,
                    ),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
