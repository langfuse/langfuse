import { type ReactNode, useState } from "react";
import { Pencil, X } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import { SortableList } from "@/src/components/design-system/SortableList/SortableList";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { getScoreDataTypeIcon } from "@/src/features/scores";

export function AnnotationQueueScoreConfigEditor({
  scoreConfigs,
  value,
  onChange,
  createAction,
  editAction,
  warnOnRemoval,
  disabled,
}: AnnotationQueueScoreConfigEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const configsById = new Map(
    scoreConfigs.map((config) => [config.id, config]),
  );
  const selectedIds = new Set(value);
  const activeConfigs = scoreConfigs.filter((config) => !config.isArchived);
  const options = scoreConfigs
    .filter((config) => !config.isArchived || selectedIds.has(config.id))
    .map((config) => ({
      value: config.id,
      label: config.name,
      secondaryLabel: config.isArchived
        ? "Archived"
        : getScoreDataTypeIcon(config.dataType),
      disabled: config.isArchived,
    }));

  return (
    <ConfirmationDialogController<string[]>
      title="Remove score configs from queue?"
      text="After saving, reopened items, including completed items, will no longer show these fields. Historical scores and completion status stay unchanged. The project-wide score configs are kept."
      confirmLabel="Remove from queue"
      variant="default"
      onConfirm={onChange}
    >
      {({ openDialog }) => {
        const changeSelection = (nextValue: string[]) => {
          if (disabled) return;
          if (warnOnRemoval && value.some((id) => !nextValue.includes(id))) {
            setPickerOpen(false);
            openDialog(nextValue);
          } else {
            onChange(nextValue);
          }
        };
        return (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="min-w-48 flex-1">
                <MultiSelectInput
                  aria-label="Select score configs"
                  value={value}
                  placeholder="Select score configs"
                  selectedLabel={`${value.length} selected`}
                  searchPlaceholder="Search score configs..."
                  emptyMessage="No score configs found."
                  selectAllLabel="Select all score configs"
                  disabled={disabled || options.length === 0}
                  options={options}
                  onValueChange={changeSelection}
                  openState={{ open: pickerOpen, onOpenChange: setPickerOpen }}
                />
              </div>
              {createAction}
            </div>
            {value.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {activeConfigs.length === 0
                  ? "Create a score config to define what annotators score."
                  : "Select score configs or create a new one."}
              </p>
            ) : (
              <>
                <p className="text-muted-foreground text-xs">
                  Fields appear in this order.
                </p>
                <div className="min-h-0">
                  <SortableList
                    items={value}
                    getId={(id) => id}
                    getLabel={(id) => configsById.get(id)?.name ?? id}
                    disabled={disabled}
                    aria-label="Selected score configs"
                    onReorder={(from, to) =>
                      onChange(arrayMove(value, from, to))
                    }
                    renderItem={(id) => {
                      const config = configsById.get(id);
                      const name = config?.name ?? id;
                      return (
                        <div className="group/config hover:bg-muted/50 flex min-h-8 items-center gap-2 rounded px-1">
                          <span
                            className="text-muted-foreground shrink-0 text-xs"
                            aria-hidden="true"
                          >
                            {config
                              ? getScoreDataTypeIcon(config.dataType)
                              : ""}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-sm"
                            title={name}
                          >
                            {name}
                          </span>
                          {config?.isArchived && <Badge text="Archived" />}
                          <div className="flex shrink-0 items-center gap-1 opacity-100 group-focus-within/config:opacity-100 group-hover/config:opacity-100 [@media(hover:hover)]:opacity-0">
                            <IconButton
                              icon={Pencil}
                              label={`Edit score config ${name}`}
                              title={
                                editAction.disabled?.reason ??
                                "Edit project-wide score config"
                              }
                              size="sm"
                              disabled={
                                disabled || !!editAction.disabled || !config
                              }
                              onClick={() => editAction.onClick(id)}
                            />
                            <IconButton
                              icon={X}
                              label={`Remove ${name} from queue`}
                              title="Remove from queue"
                              size="sm"
                              disabled={disabled}
                              onClick={() =>
                                changeSelection(
                                  value.filter((configId) => configId !== id),
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>
              </>
            )}
          </div>
        );
      }}
    </ConfirmationDialogController>
  );
}

type AnnotationQueueScoreConfigEditorProps = {
  scoreConfigs: Pick<
    ScoreConfigDomain,
    "id" | "name" | "dataType" | "isArchived"
  >[];
  value: string[];
  onChange: (ids: string[]) => void;
  createAction: ReactNode;
  editAction: {
    disabled: { reason: string } | undefined;
    onClick: (configId: string) => void;
  };
  warnOnRemoval: boolean;
  disabled: boolean;
};
