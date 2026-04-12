import { Trash2, Type } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseVariableVM } from "../types/dashboard";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import type { EditableVariableField } from "./spielwieseVariablesPanelState";
import { getSpielwieseToneStyles } from "./spielwieseToneStyles";

const variableShellClassName =
  "[--variable-shell-gap:2px] [--variable-shell-radius:14px] [--variable-field-radius:calc(var(--variable-shell-radius)-var(--variable-shell-gap)-2px)] overflow-hidden rounded-[var(--variable-shell-radius)] border border-[rgba(15,23,42,0.08)] [background-color:var(--variable-shell-fill)] p-[var(--variable-shell-gap)]";

const inactiveChromeClassName =
  "border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.62)] shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]";

type SpielwieseVariableEditorProps = {
  item: SpielwieseVariableVM;
  itemIndex: number;
  onChange: (
    id: SpielwieseVariableVM["id"],
    field: EditableVariableField,
    value: string,
  ) => void;
  onDelete: (id: SpielwieseVariableVM["id"]) => void;
};

function getVariableToneStyle(index: number): CSSProperties {
  const toneStyles = getSpielwieseToneStyles(index);
  return {
    "--variable-accent": toneStyles.accent,
    "--variable-field-fill": toneStyles.fill,
    "--variable-shell-fill": toneStyles.shellFill,
    "--variable-surface-fill": toneStyles.surfaceFill,
  } as CSSProperties;
}

function getVariableEditorClassNames(item: SpielwieseVariableVM) {
  return {
    actionClassName: item.isActive
      ? "text-[var(--variable-accent)] hover:bg-[rgba(255,255,255,0.84)] hover:text-[var(--variable-accent)] focus-visible:ring-[rgba(15,23,42,0.08)] focus-visible:ring-offset-0"
      : "text-muted-foreground hover:bg-[rgba(255,255,255,0.84)] hover:text-[var(--variable-accent)] focus-visible:ring-[rgba(15,23,42,0.08)] focus-visible:ring-offset-0",
    chromeClassName: item.isActive
      ? "border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.58)] shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
      : inactiveChromeClassName,
    fieldClassName:
      "border-[rgba(15,23,42,0.08)] [background-color:var(--variable-field-fill)] text-foreground placeholder:text-foreground/40 shadow-none focus-visible:border-[rgba(15,23,42,0.08)] focus-visible:ring-0",
    iconClassName: "text-[var(--variable-accent)]",
    surfaceClassName:
      "border-[rgba(15,23,42,0.06)] [background-color:var(--variable-surface-fill)]",
  };
}

type VariableEditorActionsProps = {
  actionClassName: string;
  chromeClassName: string;
  iconClassName: string;
  itemId: SpielwieseVariableVM["id"];
  onDelete: (id: SpielwieseVariableVM["id"]) => void;
};

type VariableEditorFieldProps = {
  fieldClassName: string;
  item: SpielwieseVariableVM;
  onChange: (
    id: SpielwieseVariableVM["id"],
    field: EditableVariableField,
    value: string,
  ) => void;
};

function VariableEditorActions({
  actionClassName,
  chromeClassName,
  iconClassName,
  itemId,
  onDelete,
}: VariableEditorActionsProps) {
  return (
    <div
      className={cn(
        "mt-0.5 flex shrink-0 items-center gap-1 rounded-[var(--variable-field-radius)] border px-1 py-1",
        chromeClassName,
      )}
    >
      <span className="inline-flex size-5 items-center justify-center rounded-[8px] bg-[rgba(255,255,255,0.72)]">
        <Type className={cn("size-3.5 shrink-0", iconClassName)} />
      </span>
      <Button
        aria-label={`Delete variable ${itemId}`}
        className={cn("size-6 rounded-[8px] px-0 shadow-none", actionClassName)}
        size="icon-sm"
        variant="ghost"
        onClick={() => onDelete(itemId)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function VariableEditorNameField({
  fieldClassName,
  item,
  onChange,
}: VariableEditorFieldProps) {
  return (
    <Input
      aria-label={`Variable name ${item.id}`}
      className={cn(
        "h-9 rounded-[var(--variable-field-radius)] px-2.5 text-[13px] font-semibold tracking-[-0.01em]",
        fieldClassName,
      )}
      name={`variable-name-${item.id}`}
      onChange={(event) => onChange(item.id, "label", event.target.value)}
      placeholder="Variable name"
      value={item.label}
    />
  );
}

function VariableEditorHelperField({
  fieldClassName,
  item,
  onChange,
}: VariableEditorFieldProps) {
  return (
    <Textarea
      aria-label={`Variable helper ${item.id}`}
      className={cn(
        "min-h-20 resize-none rounded-[var(--variable-field-radius)] px-2.5 py-2 text-[13px] leading-5",
        fieldClassName,
      )}
      name={`variable-helper-${item.id}`}
      onChange={(event) => onChange(item.id, "helper", event.target.value)}
      placeholder="Add a sample value so you can test the prompt with it."
      value={item.helper}
    />
  );
}

export function SpielwieseVariableEditor({
  item,
  itemIndex,
  onChange,
  onDelete,
}: SpielwieseVariableEditorProps) {
  const classNames = getVariableEditorClassNames(item);
  const toneStyle = getVariableToneStyle(itemIndex);

  return (
    <li className="list-none">
      <div
        className={variableShellClassName}
        data-testid="spielwiese-variable-editor"
        style={toneStyle}
      >
        <div
          className={cn(
            "grid gap-2.5 rounded-[calc(var(--variable-shell-radius)-var(--variable-shell-gap))] border px-3 py-3",
            classNames.surfaceClassName,
          )}
          data-testid="spielwiese-variable-editor-surface"
        >
          <div className="flex items-start justify-between gap-3">
            <VariableEditorNameField
              fieldClassName={classNames.fieldClassName}
              item={item}
              onChange={onChange}
            />
            <VariableEditorActions
              actionClassName={classNames.actionClassName}
              chromeClassName={classNames.chromeClassName}
              iconClassName={classNames.iconClassName}
              itemId={item.id}
              onDelete={onDelete}
            />
          </div>
          <VariableEditorHelperField
            fieldClassName={classNames.fieldClassName}
            item={item}
            onChange={onChange}
          />
        </div>
      </div>
    </li>
  );
}
