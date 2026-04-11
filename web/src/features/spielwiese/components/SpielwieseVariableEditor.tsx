import { Trash2, Type } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseVariableVM } from "../types/dashboard";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import type { EditableVariableField } from "./spielwieseVariablesPanelState";

function getToneClassNames(tone: SpielwieseVariableVM["tone"]) {
  if (tone === "green") {
    return {
      field:
        "border-transparent bg-background/45 text-dark-green placeholder:text-dark-green/60 shadow-none focus-visible:border-transparent focus-visible:ring-background/50",
      icon: "text-dark-green",
      surface: "bg-light-green/70",
    };
  }

  if (tone === "yellow") {
    return {
      field:
        "border-transparent bg-background/45 text-dark-yellow placeholder:text-dark-yellow/60 shadow-none focus-visible:border-transparent focus-visible:ring-background/50",
      icon: "text-dark-yellow",
      surface: "bg-light-yellow/70",
    };
  }

  return {
    field:
      "border-transparent bg-background/45 text-dark-blue placeholder:text-dark-blue/60 shadow-none focus-visible:border-transparent focus-visible:ring-background/50",
    icon: "text-dark-blue",
    surface: "bg-light-blue/70",
  };
}

type SpielwieseVariableEditorProps = {
  item: SpielwieseVariableVM;
  onChange: (
    id: SpielwieseVariableVM["id"],
    field: EditableVariableField,
    value: string,
  ) => void;
  onDelete: (id: SpielwieseVariableVM["id"]) => void;
};

export function SpielwieseVariableEditor({
  item,
  onChange,
  onDelete,
}: SpielwieseVariableEditorProps) {
  const toneClassNames = getToneClassNames(item.tone);

  return (
    <li className="list-none">
      <div
        className={cn(
          "grid gap-2 rounded-lg px-3 py-2.5",
          item.isActive
            ? toneClassNames.surface
            : "bg-background border-border/70 border",
        )}
        data-testid="spielwiese-variable-editor"
      >
        <div className="flex items-start justify-between gap-3">
          <Input
            aria-label={`Variable name ${item.id}`}
            className={cn("font-semibold", toneClassNames.field)}
            name={`variable-name-${item.id}`}
            onChange={(event) => onChange(item.id, "label", event.target.value)}
            placeholder="Variable name"
            value={item.label}
          />
          <div className="flex items-center gap-1 pt-1">
            <Type className={cn("size-3.5 shrink-0", toneClassNames.icon)} />
            <Button
              aria-label={`Delete variable ${item.id}`}
              className={toneClassNames.icon}
              size="icon-sm"
              variant="ghost"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <Textarea
          aria-label={`Variable helper ${item.id}`}
          className={cn("min-h-16 resize-none", toneClassNames.field)}
          name={`variable-helper-${item.id}`}
          onChange={(event) => onChange(item.id, "helper", event.target.value)}
          placeholder="Add a sample value so you can test the prompt with it."
          value={item.helper}
        />
      </div>
    </li>
  );
}
