import { useId, useState } from "react";
import {
  CircleCheckIcon,
  CircleFadingArrowUp,
  CircleIcon,
  Plus,
  TagIcon,
  X,
} from "lucide-react";
import { PromptLabelSchema, SKILL_LATEST_LABEL } from "@langfuse/shared";
import { TruncatedLabels } from "@/src/components/TruncatedLabels";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { PopoverController } from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";

export function SkillLabelsSelect({
  value,
  options,
  disabled,
  isSaving,
  showOnlyOnHover,
  onSave,
}: {
  value: string[];
  options: string[];
  disabled: boolean;
  isSaving: boolean;
  showOnlyOnHover: boolean;
  onSave: (value: string[]) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const editableLabels = value.filter((label) => label !== SKILL_LATEST_LABEL);
  const [pendingLabels, setPendingLabels] = useState(editableLabels);
  const listId = useId();
  const normalizedSearch = search.trim();
  const labels = [...new Set([...options, ...value, ...pendingLabels])]
    .filter((label) => label !== SKILL_LATEST_LABEL)
    .toSorted((left, right) => left.localeCompare(right));
  const customLabels = labels.filter((label) => label !== "production");
  const visibleLabels = customLabels.filter((label) =>
    label.toLowerCase().includes(normalizedSearch.toLowerCase()),
  );
  const canCreate =
    normalizedSearch.length > 0 &&
    normalizedSearch !== SKILL_LATEST_LABEL &&
    !labels.includes(normalizedSearch) &&
    PromptLabelSchema.safeParse(normalizedSearch).success;
  const labelsChanged =
    JSON.stringify([...pendingLabels].sort()) !==
    JSON.stringify([...editableLabels].sort());
  const isPromotingToProduction =
    !value.includes("production") && pendingLabels.includes("production");
  const isDemotingFromProduction =
    value.includes("production") && !pendingLabels.includes("production");
  let saveButtonCopy = "Save labels";
  if (isPromotingToProduction)
    saveButtonCopy = "Save and promote to production";
  else if (isDemotingFromProduction)
    saveButtonCopy = "Save and remove from production";

  const toggleLabel = (label: string) => {
    setPendingLabels(
      pendingLabels.includes(label)
        ? pendingLabels.filter((selected) => selected !== label)
        : [...pendingLabels, label],
    );
  };

  const createLabel = () => {
    if (!canCreate) return;
    setPendingLabels([...pendingLabels, normalizedSearch]);
    setSearch("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setPendingLabels(editableLabels);
      setSearch("");
    }
  };

  const saveLabels = async (closePopover: () => void) => {
    if (await onSave(pendingLabels)) closePopover();
  };

  return (
    <PopoverController
      align="start"
      contentClassName="ph-no-capture w-80 p-3"
      disabled={disabled}
      modal={false}
      onOpenChange={handleOpenChange}
      renderContent={({ closePopover }) => (
        <>
          <h2 className="mb-1 font-bold">Skill labels</h2>
          <p className="text-muted-foreground mb-3 text-xs">
            Use labels to identify deployment targets for this version.
          </p>
          <div className="border-y py-2">
            <p className="text-muted-foreground mb-1 px-2 text-xs font-bold">
              Promote to production?
            </p>
            <SelectionRow
              value="production"
              selected={pendingLabels.includes("production")}
              onSelect={() => toggleLabel("production")}
            />
          </div>
          <div className="pt-2">
            <p className="text-muted-foreground mb-2 px-2 text-xs font-bold">
              Custom labels
            </p>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canCreate) {
                  event.preventDefault();
                  createLabel();
                }
              }}
              placeholder="Search or create label…"
              className="mb-2 h-8"
            />
            <div id={listId} className="max-h-52 overflow-y-auto">
              {visibleLabels.map((label) => (
                <SelectionRow
                  key={label}
                  value={label}
                  selected={pendingLabels.includes(label)}
                  onSelect={() => toggleLabel(label)}
                />
              ))}
              {canCreate ? (
                <CreateRow value={normalizedSearch} onCreate={createLabel} />
              ) : null}
              {visibleLabels.length === 0 && !canCreate ? (
                <EmptyOptions copy="No matching labels" />
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant={
              isPromotingToProduction || isDemotingFromProduction
                ? "destructive"
                : "default"
            }
            loading={isSaving}
            disabled={!labelsChanged}
            className="mt-3 w-full"
            onClick={() => saveLabels(closePopover)}
          >
            {saveButtonCopy}
          </Button>
        </>
      )}
    >
      {({ Trigger, isOpen }) => (
        <Trigger asChild>
          <div
            role="combobox"
            aria-label="Labels"
            aria-controls={listId}
            aria-expanded={isOpen}
            aria-disabled={disabled}
            tabIndex={0}
            className={cn(
              "flex min-h-8 w-fit max-w-full flex-wrap items-center gap-1",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            <TruncatedLabels labels={value} maxVisibleLabels={5} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Add skill label"
              disabled={disabled}
              className={cn(
                "bg-muted-gray text-primary h-6 w-6",
                showOnlyOnHover &&
                  !isOpen &&
                  "opacity-0 group-focus-within/skill-version:opacity-100 group-hover/skill-version:opacity-100 [@media(hover:none)]:opacity-100",
              )}
            >
              <CircleFadingArrowUp className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Trigger>
      )}
    </PopoverController>
  );
}

export function SkillTagsSelect({
  value,
  options,
  disabled,
  isSaving,
  onSave,
}: {
  value: string[];
  options: string[];
  disabled: boolean;
  isSaving: boolean;
  onSave: (value: string[]) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const [pendingTags, setPendingTags] = useState(value);
  const listId = useId();
  const normalizedSearch = search.trim();
  const tags = [...new Set([...options, ...value, ...pendingTags])].toSorted(
    (left, right) => left.localeCompare(right),
  );
  const visibleTags = tags.filter(
    (tag) =>
      !pendingTags.includes(tag) &&
      tag.toLowerCase().includes(normalizedSearch.toLowerCase()),
  );
  const canCreate =
    normalizedSearch.length > 0 &&
    normalizedSearch.length <= 100 &&
    !tags.some((tag) => tag.toLowerCase() === normalizedSearch.toLowerCase());
  const tagsChanged =
    JSON.stringify([...pendingTags].sort()) !==
    JSON.stringify([...value].sort());

  const createTag = () => {
    if (!canCreate) return;
    setPendingTags([...pendingTags, normalizedSearch]);
    setSearch("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setPendingTags(value);
      setSearch("");
    }
  };

  const saveTags = async (closePopover: () => void) => {
    if (await onSave(pendingTags)) closePopover();
  };

  return (
    <PopoverController
      align="start"
      contentClassName="ph-no-capture w-72 p-3"
      disabled={disabled}
      modal={false}
      onOpenChange={handleOpenChange}
      renderContent={({ closePopover }) => (
        <>
          <h2 className="mb-2 font-bold">Skill tags</h2>
          <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border px-2 py-1">
            {pendingTags.map((tag) => (
              <Button
                key={tag}
                type="button"
                variant="tertiary"
                size="icon-sm"
                onClick={() =>
                  setPendingTags(
                    pendingTags.filter((selected) => selected !== tag),
                  )
                }
              >
                {tag}
                <X className="ml-1 h-3 w-3" />
              </Button>
            ))}
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canCreate) {
                  event.preventDefault();
                  createTag();
                }
              }}
              placeholder="Search or create tag…"
              className="h-8 min-w-36 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
            />
          </div>
          <div id={listId} className="max-h-52 overflow-y-auto">
            {visibleTags.map((tag) => (
              <Button
                key={tag}
                type="button"
                variant="ghost"
                className="w-full justify-start px-2 font-normal"
                onClick={() => setPendingTags([...pendingTags, tag])}
              >
                <Plus className="mr-2 h-4 w-4" />
                {tag}
              </Button>
            ))}
            {canCreate ? (
              <CreateRow value={normalizedSearch} onCreate={createTag} />
            ) : null}
            {visibleTags.length === 0 && !canCreate ? (
              <EmptyOptions copy="No available tags" />
            ) : null}
          </div>
          <Button
            type="button"
            loading={isSaving}
            disabled={!tagsChanged}
            className="mt-3 w-full"
            onClick={() => saveTags(closePopover)}
          >
            Save tags
          </Button>
        </>
      )}
    >
      {({ Trigger, isOpen }) => (
        <Trigger asChild>
          <div
            role="combobox"
            aria-label="Tags"
            aria-controls={listId}
            aria-expanded={isOpen}
            aria-disabled={disabled}
            tabIndex={0}
            className={cn(
              "flex min-h-8 w-fit max-w-full flex-wrap items-center gap-1",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            {value.map((tag) => (
              <Badge key={tag} variant="tertiary" className="h-6 gap-1">
                <TagIcon className="h-3 w-3" />
                <span className="max-w-36 truncate" title={tag}>
                  {tag}
                </span>
              </Badge>
            ))}
            <Badge variant="tertiary" className="h-6">
              <TagIcon className="h-3.5 w-3.5" />
            </Badge>
          </div>
        </Trigger>
      )}
    </PopoverController>
  );
}

function SelectionRow({
  value,
  selected,
  onSelect,
}: {
  value: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "w-full justify-start px-2 py-1 text-sm",
        selected && "font-bold",
      )}
      onClick={onSelect}
    >
      {selected ? (
        <CircleCheckIcon className="mr-2 h-4 w-4" />
      ) : (
        <CircleIcon className="mr-2 h-4 w-4 opacity-20" />
      )}
      {value}
    </Button>
  );
}

function CreateRow({
  value,
  onCreate,
}: {
  value: string;
  onCreate: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="text-muted-foreground w-full justify-start px-2 font-normal"
      onClick={onCreate}
    >
      <Plus className="mr-2 h-4 w-4" />
      Create new: “{value}”
    </Button>
  );
}

function EmptyOptions({ copy }: { copy: string }) {
  return (
    <div className="text-muted-foreground px-2 py-4 text-center text-sm">
      {copy}
    </div>
  );
}
