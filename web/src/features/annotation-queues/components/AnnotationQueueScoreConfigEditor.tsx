import { type ReactNode, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, X } from "lucide-react";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
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
  const [announcement, setAnnouncement] = useState("");
  const activeConfigs = scoreConfigs.filter((config) => !config.isArchived);
  const configsById = new Map(
    scoreConfigs.map((config) => [config.id, config]),
  );
  const handleAdd = (id: string) => onChange([...value, id]);
  const remove = (id: string) => {
    onChange(value.filter((configId) => configId !== id));
    setAnnouncement(
      `Removed ${configsById.get(id)?.name ?? id} from this queue.`,
    );
  };
  const move = (index: number, direction: -1 | 1) => {
    const reordered = [...value];
    const nextIndex = index + direction;
    [reordered[index], reordered[nextIndex]] = [
      reordered[nextIndex]!,
      reordered[index]!,
    ];
    onChange(reordered);
    setAnnouncement(
      `${configsById.get(value[index]!)?.name ?? value[index]} moved to position ${nextIndex + 1} of ${value.length}.`,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {activeConfigs.length > 0 ? (
          <div className="min-w-48 flex-1">
            <SelectInput
              aria-label="Add existing score config"
              value=""
              placeholder="Add existing score config"
              search={{ placeholder: "Search score configs..." }}
              emptyMessage="No other active score configs available."
              disabled={disabled}
              options={activeConfigs
                .filter((config) => !value.includes(config.id))
                .map((config) => ({
                  value: config.id,
                  label: `${getScoreDataTypeIcon(config.dataType)} ${config.name}`,
                }))}
              onValueChange={handleAdd}
            />
          </div>
        ) : (
          <p className="text-muted-foreground min-w-48 flex-1 text-sm">
            No score configs yet. Create one here to define your first
            annotation field, even if your project already has scores.
          </p>
        )}
        {createAction}
      </div>
      {value.length === 0 && activeConfigs.length > 0 && (
        <p className="text-muted-foreground text-sm">
          No score configs selected. Add an existing config or create one above.
        </p>
      )}
      <ConfirmationDialogController<string>
        title="Remove score config from queue?"
        text="This queue contains items. After saving, reopened items, including completed items, will no longer show this field. Historical scores are kept and completion status stays the same. The project-wide score config is kept."
        confirmLabel="Remove from queue"
        variant="default"
        onConfirm={remove}
      >
        {({ openDialog }) => (
          <ol
            aria-label="Selected score configs"
            className="divide-y rounded-md border px-3"
          >
            {value.map((id, index) => {
              const config = configsById.get(id);
              const name = config?.name ?? id;
              const handleEdit = () => editAction.onClick(id);
              const handleMoveUp = () => move(index, -1);
              const handleMoveDown = () => move(index, 1);
              const handleRemove = () => {
                if (warnOnRemoval) {
                  openDialog(id);
                } else {
                  remove(id);
                }
              };
              return (
                <li key={id} className="flex items-center gap-2 py-2">
                  <span className="text-muted-foreground w-4 shrink-0 text-xs">
                    {index + 1}.
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="text-sm wrap-anywhere">{name}</span>
                    {config?.isArchived && <Badge text="Archived" />}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      icon={Pencil}
                      label={`Edit score config ${name}`}
                      title={
                        editAction.disabled?.reason ??
                        "Edit project-wide score config"
                      }
                      size="sm"
                      disabled={disabled || !!editAction.disabled || !config}
                      onClick={handleEdit}
                    />
                    <IconButton
                      icon={ArrowUp}
                      label={`Move ${name} up`}
                      title="Move up"
                      size="sm"
                      disabled={disabled || index === 0}
                      onClick={handleMoveUp}
                    />
                    <IconButton
                      icon={ArrowDown}
                      label={`Move ${name} down`}
                      title="Move down"
                      size="sm"
                      disabled={disabled || index === value.length - 1}
                      onClick={handleMoveDown}
                    />
                    <IconButton
                      icon={X}
                      label={`Remove ${name} from queue`}
                      title="Remove from queue"
                      size="sm"
                      disabled={disabled}
                      onClick={handleRemove}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </ConfirmationDialogController>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
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
