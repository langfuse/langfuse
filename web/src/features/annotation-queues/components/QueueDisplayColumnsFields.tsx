import { Plus, X } from "@langfuse/icons";
import { arrayMove } from "@dnd-kit/sortable";
import {
  ANNOTATION_QUEUE_TRACE_FIELDS,
  MAX_ANNOTATION_QUEUE_DISPLAY_COLUMNS,
  type AnnotationQueueDisplayColumn,
} from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { SortableList } from "@/src/components/design-system/SortableList/SortableList";

type Source = AnnotationQueueDisplayColumn["source"];
type Format = AnnotationQueueDisplayColumn["format"];

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: "trace", label: "Trace field" },
  { value: "metadata", label: "Metadata key" },
  { value: "tag", label: "Tag prefix" },
];

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "phone", label: "Phone number" },
  { value: "link", label: "Link" },
  { value: "datetime", label: "Date / time" },
  { value: "number", label: "Number" },
  { value: "duration", label: "Duration (seconds)" },
  { value: "badge", label: "Badge" },
];

const KEY_PLACEHOLDERS: Record<Exclude<Source, "trace">, string> = {
  metadata: "e.g. location_name or customer.name",
  tag: "e.g. region:",
};

export type QueueDisplayColumnErrors = Array<
  Partial<Record<"key" | "label", string>> | undefined
>;

/**
 * Editor for a queue's extra trace columns: each row picks where the value
 * comes from (trace field, metadata key or tag prefix), the column label and
 * how the value is formatted. Rows can be reordered by dragging. Adding stops
 * at the schema's column limit.
 */
export function QueueDisplayColumnsFields({
  value,
  onChange,
  disabled,
  errors = [],
  listError,
}: {
  value: AnnotationQueueDisplayColumn[];
  onChange: (columns: AnnotationQueueDisplayColumn[]) => void;
  disabled: boolean;
  errors?: QueueDisplayColumnErrors;
  listError?: string;
}) {
  const atLimit = value.length >= MAX_ANNOTATION_QUEUE_DISPLAY_COLUMNS;

  const update = (
    index: number,
    patch: Partial<AnnotationQueueDisplayColumn>,
  ) =>
    onChange(
      value.map((column, i) =>
        i === index ? { ...column, ...patch } : column,
      ),
    );

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <SortableList
          gap="md"
          variant="hover-card"
          items={value}
          getId={(_, index) => `display-column-${index}`}
          getLabel={(column) => column.label || column.key || "New column"}
          disabled={disabled}
          aria-label="Table columns"
          onReorder={(from, to) => onChange(arrayMove(value, from, to))}
          renderItem={(column, index) => (
            <div className="flex flex-col gap-2 pr-6">
              <div className="flex items-center gap-2">
                <span
                  className="min-w-0 flex-1 truncate text-xs font-bold"
                  title={column.label || "New column"}
                >
                  {column.label || "New column"}
                </span>
                <IconButton
                  icon={X}
                  label={`Remove column ${column.label || index + 1}`}
                  size="xs"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectInput
                  aria-label="Source"
                  placeholder="Source"
                  value={column.source}
                  options={SOURCE_OPTIONS}
                  disabled={disabled}
                  onValueChange={(source) =>
                    update(index, {
                      source,
                      key: source === "trace" ? "userId" : "",
                    })
                  }
                />
                {column.source === "trace" ? (
                  <SelectInput
                    aria-label="Trace field"
                    placeholder="Trace field"
                    value={column.key}
                    options={ANNOTATION_QUEUE_TRACE_FIELDS.map((field) => ({
                      value: field,
                      label: field,
                    }))}
                    disabled={disabled}
                    onValueChange={(key) => update(index, { key })}
                  />
                ) : (
                  <Input
                    aria-label={
                      column.source === "tag" ? "Tag prefix" : "Metadata key"
                    }
                    placeholder={KEY_PLACEHOLDERS[column.source]}
                    value={column.key}
                    disabled={disabled}
                    error={!!errors[index]?.key}
                    onChange={(event) =>
                      update(index, { key: event.target.value })
                    }
                  />
                )}
                <Input
                  aria-label="Column label"
                  placeholder="Column label"
                  value={column.label}
                  disabled={disabled}
                  error={!!errors[index]?.label}
                  onChange={(event) =>
                    update(index, { label: event.target.value })
                  }
                />
                <SelectInput
                  aria-label="Format"
                  placeholder="Format"
                  value={column.format}
                  options={FORMAT_OPTIONS}
                  disabled={disabled}
                  onValueChange={(format) => update(index, { format })}
                />
              </div>
              {(errors[index]?.key || errors[index]?.label) && (
                <p role="alert" className="text-destructive text-xs">
                  {errors[index]?.key ?? errors[index]?.label}
                </p>
              )}
            </div>
          )}
        />
      )}
      {listError && (
        <p role="alert" className="text-destructive text-xs">
          {listError}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          text="Add column"
          variant="secondary"
          icon={Plus}
          disabled={disabled || atLimit}
          onClick={() =>
            onChange([
              ...value,
              { source: "metadata", key: "", label: "", format: "text" },
            ])
          }
        />
        {atLimit && !listError && (
          <span className="text-muted-foreground text-xs">
            A queue can have at most {MAX_ANNOTATION_QUEUE_DISPLAY_COLUMNS}{" "}
            extra columns.
          </span>
        )}
      </div>
    </div>
  );
}
