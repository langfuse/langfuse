// CIP fork feature (see FORK.md): the builder's center canvas — a live render
// of the selected page with the title, description, and choice labels editable
// in place (heyform's on-canvas editing, our implementation). Everything else
// is configured in the right panel.
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import { Plus, X } from "lucide-react";
import { useState, type Dispatch } from "react";
import {
  isChoicesField,
  newFieldId,
  type AnswerValue,
  type FormField,
} from "../../lib/contract";
import { FieldControl } from "../renderer/ElicitationRenderer";
import { patchProperties, type BuilderAction } from "./builder-state";

function ChoicesEditor({
  field,
  dispatch,
}: {
  field: FormField;
  dispatch: Dispatch<BuilderAction>;
}) {
  const choices = field.properties?.choices ?? [];
  const isPicture = field.kind === "picture_choice";

  const update = (choicesNext: typeof choices) =>
    dispatch({
      type: "updateField",
      id: field.id,
      patch: patchProperties(field, { choices: choicesNext }),
    });

  return (
    <div className="flex max-w-xl flex-col gap-2">
      {choices.map((choice, i) => (
        <div
          key={choice.id}
          className="group flex items-center gap-2 rounded-md border border-border p-2"
        >
          <span className="h-4 w-4 shrink-0 rounded-full border border-border" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              value={choice.label}
              onChange={(e) =>
                update(
                  choices.map((c, j) =>
                    j === i ? { ...c, label: e.target.value } : c,
                  ),
                )
              }
              placeholder={`Option ${i + 1}`}
              className="h-8 border-none bg-transparent px-1 shadow-none focus-visible:ring-1"
            />
            {isPicture && (
              <Input
                value={choice.image_url ?? ""}
                onChange={(e) =>
                  update(
                    choices.map((c, j) =>
                      j === i ? { ...c, image_url: e.target.value } : c,
                    ),
                  )
                }
                placeholder="Image URL"
                className="h-7 border-none bg-transparent px-1 text-xs text-muted-foreground shadow-none focus-visible:ring-1"
              />
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
            disabled={choices.length <= 1}
            onClick={() => update(choices.filter((_, j) => j !== i))}
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Remove option</span>
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => update([...choices, { id: newFieldId(), label: "" }])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add option
      </Button>
      {field.properties?.allow_other && (
        <p className="text-xs text-muted-foreground">
          + an “Other” write-in option is shown to respondents
        </p>
      )}
      {field.properties?.allow_none && (
        <p className="text-xs text-muted-foreground">
          + a “None of the above” option is shown to respondents
        </p>
      )}
    </div>
  );
}

/**
 * Interactive control preview with a scratch answer that is never recorded.
 * Keyed by field id in the canvas so switching pages resets it.
 */
function CanvasControlPreview({ field }: { field: FormField }) {
  const [scratch, setScratch] = useState<AnswerValue>(null);
  return <FieldControl field={field} value={scratch} onChange={setScratch} />;
}

export function BuilderCanvas({
  field,
  dispatch,
}: {
  field: FormField | undefined;
  dispatch: Dispatch<BuilderAction>;
}) {
  if (!field) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Add a page to start building.
      </div>
    );
  }

  const editableChoices =
    isChoicesField(field.kind) || field.kind === "ranking";

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-8 py-12">
        <Input
          key={`${field.id}-title`}
          value={field.title}
          onChange={(e) =>
            dispatch({
              type: "updateField",
              id: field.id,
              patch: { title: e.target.value },
            })
          }
          placeholder="Your question"
          className={cn(
            "h-auto border-none bg-transparent px-0 font-semibold shadow-none focus-visible:ring-0",
            field.kind === "welcome" ? "text-3xl" : "text-xl",
          )}
        />
        <Textarea
          key={`${field.id}-description`}
          value={field.description ?? ""}
          onChange={(e) =>
            dispatch({
              type: "updateField",
              id: field.id,
              patch: { description: e.target.value },
            })
          }
          placeholder="Add a description (optional)"
          rows={1}
          className="mt-1 min-h-0 resize-none border-none bg-transparent px-0 text-muted-foreground shadow-none focus-visible:ring-0"
        />
        <div className="mt-6">
          {editableChoices ? (
            <ChoicesEditor field={field} dispatch={dispatch} />
          ) : (
            <CanvasControlPreview key={field.id} field={field} />
          )}
        </div>
      </div>
    </div>
  );
}
