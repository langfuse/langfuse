import { Info, Pencil, Plus, X } from "@langfuse/icons";
import { arrayMove } from "@dnd-kit/sortable";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { formatScoreRange } from "@/src/features/scores";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button } from "@/src/components/ui/button";
import { SortableList } from "@/src/components/design-system/SortableList/SortableList";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Textarea } from "@/src/components/ui/textarea";
import { shouldUseCombobox } from "@/src/features/scores/components/CategoricalScoreInput";
import { ScoreConfigDescription } from "@/src/features/scores/components/ScoreConfigDescription";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

export function AnnotationQueueScoreConfigEditor({
  scoreConfigs,
  value,
  onChange,
  createAction,
  editAction,
  warnOnRemoval,
  disabled,
}: AnnotationQueueScoreConfigEditorProps) {
  const configsById = new Map(
    scoreConfigs.map((config) => [config.id, config]),
  );
  const selectedIds = new Set(value);
  const availableConfigs = scoreConfigs.filter(
    (config) => !config.isArchived && !selectedIds.has(config.id),
  );

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
            openDialog(nextValue);
          } else {
            onChange(nextValue);
          }
        };
        return (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu
                disabled={disabled}
                maxHeight="18rem"
                placement="bottom-start"
                search={{ placeholder: "Search scores..." }}
                items={[
                  ...availableConfigs.map((config) => ({
                    type: "item" as const,
                    id: config.id,
                    title: `${config.name} (${scoreDataTypeLabels[config.dataType]})`,
                    onClick: () => {
                      if (!disabled) onChange([...value, config.id]);
                    },
                  })),
                  { type: "separator", id: "score-config-actions" },
                  {
                    type: "item",
                    id: "create-score-config",
                    title: "Add score config",
                    icon: Plus,
                    disabled: createAction.disabled,
                    searchBehavior: "show-when-no-results",
                    onClick: createAction.onClick,
                  },
                ]}
              >
                {({ getTriggerProps }) => (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={disabled}
                    {...getTriggerProps()}
                  >
                    <Plus size="base" color="default" aria-hidden />
                    Add score
                  </Button>
                )}
              </DropdownMenu>
              <Tooltip label="Score configs define the fields annotators see. Adding or removing fields applies when items are reopened, including completed items. Historical scores and completion status stay unchanged. Editing a score config changes its project-wide definition for future scoring wherever it is used.">
                {({ getTriggerProps }) => (
                  <IconButton
                    {...getTriggerProps()}
                    icon={Info}
                    label="About queue score configs"
                    size="sm"
                  />
                )}
              </Tooltip>
            </div>
            {value.length > 0 && (
              <div className="min-h-0">
                <SortableList
                  gap="md"
                  variant="hover-card"
                  items={value}
                  getId={(id) => id}
                  getLabel={(id) => configsById.get(id)?.name ?? id}
                  disabled={disabled}
                  aria-label="Selected score configs"
                  onReorder={(from, to) => onChange(arrayMove(value, from, to))}
                  renderItem={(id) => {
                    const config = configsById.get(id);
                    const name = config?.name ?? id;
                    return (
                      <div className="flex flex-col gap-2">
                        <div className="flex min-h-6 items-center gap-2 pr-6">
                          <span
                            className="min-w-0 flex-1 text-xs font-bold wrap-break-word"
                            title={name}
                          >
                            {name}
                          </span>
                          {config?.isArchived && <Badge text="Archived" />}
                          <div className="flex shrink-0 items-center gap-1 opacity-100 group-focus-within/sortable:opacity-100 group-hover/sortable:opacity-100 [@media(hover:hover)]:opacity-0">
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
                        {config && <ScoreConfigFieldPreview config={config} />}
                      </div>
                    );
                  }}
                />
              </div>
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
    | "id"
    | "name"
    | "dataType"
    | "isArchived"
    | "description"
    | "minValue"
    | "maxValue"
    | "categories"
  >[];
  value: string[];
  onChange: (ids: string[]) => void;
  createAction: {
    disabled: { reason: string } | undefined;
    onClick: () => void;
  };
  editAction: {
    disabled: { reason: string } | undefined;
    onClick: (configId: string) => void;
  };
  warnOnRemoval: boolean;
  disabled: boolean;
};

function ScoreConfigFieldPreview({
  config,
}: {
  config: AnnotationQueueScoreConfigEditorProps["scoreConfigs"][number];
}) {
  const categories = config.categories ?? [];
  const rangeLabel = formatScoreRange(config.minValue, config.maxValue);
  const categorical =
    config.dataType === "CATEGORICAL" || config.dataType === "BOOLEAN";
  const useDropdown = shouldUseCombobox(categories);

  return (
    <div className="flex flex-col gap-1.5">
      {config.description?.trim() && (
        <ScoreConfigDescription
          key={config.id}
          configId={config.id}
          name={config.name}
          description={config.description}
        />
      )}
      <div inert aria-hidden="true">
        {config.dataType === "TEXT" && (
          <Textarea
            readOnly
            rows={2}
            className="min-h-16 resize-none text-xs"
            placeholder="Enter free form text..."
          />
        )}
        {config.dataType === "NUMERIC" && (
          <Input readOnly type="number" placeholder={rangeLabel} />
        )}
        {categorical && useDropdown && (
          <SelectInput
            value=""
            onValueChange={() => {}}
            placeholder="Select category"
            options={categories.map((category) => ({
              value: category.label,
              label: category.label,
            }))}
          />
        )}
        {categorical && !useDropdown && (
          <Tabs value="">
            <Tabs.List
              variant="inset"
              size="md"
              layout="full"
              aria-label={config.name}
            >
              {categories.map((category) => (
                <Tabs.Trigger key={category.value} value={category.label}>
                  {category.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs>
        )}
      </div>
      {categories.length > 0 && useDropdown && (
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {categories.map((category) => category.label).join(" · ")}
        </p>
      )}
    </div>
  );
}

const scoreDataTypeLabels = {
  NUMERIC: "Numeric",
  CATEGORICAL: "Categorical",
  BOOLEAN: "Boolean",
  TEXT: "Text",
};
