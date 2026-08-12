// CIP fork feature (see FORK.md): per-kind settings for the selected page —
// heyform's settings matrix as a concept (required, delays, choice toggles,
// scale bounds/labels) extended with the Weval grid and AI-section config.
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Separator } from "@/src/components/ui/separator";
import { Switch } from "@/src/components/ui/switch";
import { Textarea } from "@/src/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { type Dispatch } from "react";
import {
  blankField,
  FIELD_KIND_GROUPS,
  FIELD_KIND_LABELS,
  isQuestion,
  isStatementField,
  newFieldId,
  type FieldKind,
  type FieldProperties,
  type FormField,
  type Row,
  type Stimulus,
} from "../../lib/contract";
import { patchProperties, type BuilderAction } from "./builder-state";

type PanelProps = {
  field: FormField;
  dispatch: Dispatch<BuilderAction>;
};

function useFieldPatch({ field, dispatch }: PanelProps) {
  return (patch: Partial<FieldProperties>) =>
    dispatch({
      type: "updateField",
      id: field.id,
      patch: patchProperties(field, patch),
    });
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function SettingBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

/** Shared editor for labeled-item lists (matrix rows/columns, statements). */
function RowListEditor({
  items,
  onChange,
  addLabel,
}: {
  items: Row[];
  onChange: (items: Row[]) => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <div key={item.id} className="flex items-center gap-1">
          <Input
            value={item.label}
            onChange={(e) =>
              onChange(
                items.map((it, j) =>
                  j === i ? { ...it, label: e.target.value } : it,
                ),
              )
            }
            className="h-8 text-sm"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={items.length <= 1}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Remove</span>
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-7 self-start text-xs"
        onClick={() => onChange([...items, { id: newFieldId(), label: "" }])}
      >
        <Plus className="mr-1 h-3 w-3" />
        {addLabel}
      </Button>
    </div>
  );
}

/** Editor for stimuli (comparison / stimulus-rating screens). */
function StimuliEditor({
  items,
  onChange,
  withPrompt,
  minItems,
}: {
  items: Stimulus[];
  onChange: (items: Stimulus[]) => void;
  withPrompt: boolean;
  minItems: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div
          key={item.id}
          className="flex flex-col gap-1.5 rounded-md border border-border p-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Stimulus {String.fromCharCode(65 + i)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={items.length <= minItems}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Remove stimulus</span>
            </Button>
          </div>
          {withPrompt && (
            <Input
              value={item.prompt ?? ""}
              onChange={(e) =>
                onChange(
                  items.map((it, j) =>
                    j === i ? { ...it, prompt: e.target.value } : it,
                  ),
                )
              }
              placeholder="Context / prompt (optional)"
              className="h-8 text-sm"
            />
          )}
          <Textarea
            value={item.content}
            onChange={(e) =>
              onChange(
                items.map((it, j) =>
                  j === i ? { ...it, content: e.target.value } : it,
                ),
              )
            }
            placeholder="Content shown to respondents"
            rows={3}
            className="text-sm"
          />
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-7 self-start text-xs"
        onClick={() => onChange([...items, { id: newFieldId(), content: "" }])}
      >
        <Plus className="mr-1 h-3 w-3" />
        Add stimulus
      </Button>
    </div>
  );
}

function KindSpecificSettings(props: PanelProps) {
  const { field } = props;
  const patch = useFieldPatch(props);
  const p = field.properties ?? {};

  if (isStatementField(field.kind)) {
    return (
      <>
        <SettingBlock label="Button text">
          <Input
            value={p.button_text ?? ""}
            onChange={(e) => patch({ button_text: e.target.value })}
            placeholder={field.kind === "welcome" ? "Start" : "Continue"}
            className="h-8 text-sm"
          />
        </SettingBlock>
        {field.kind !== "thank_you" && (
          <SettingBlock label="Read delay (seconds before Next enables)">
            <Input
              type="number"
              min={0}
              max={300}
              value={p.min_read_seconds ?? 0}
              onChange={(e) =>
                patch({
                  min_read_seconds: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="h-8 w-24 text-sm"
            />
          </SettingBlock>
        )}
      </>
    );
  }

  switch (field.kind) {
    case "short_text":
    case "long_text":
      return (
        <>
          <SettingBlock label="Placeholder">
            <Input
              value={p.placeholder ?? ""}
              onChange={(e) => patch({ placeholder: e.target.value })}
              className="h-8 text-sm"
            />
          </SettingBlock>
          <SettingBlock label="Minimum characters">
            <Input
              type="number"
              min={0}
              value={p.min_chars ?? 0}
              onChange={(e) =>
                patch({ min_chars: Math.max(0, Number(e.target.value) || 0) })
              }
              className="h-8 w-24 text-sm"
            />
          </SettingBlock>
        </>
      );
    case "number":
      return (
        <>
          <SettingBlock label="Minimum value">
            <Input
              type="number"
              value={p.min_value ?? ""}
              onChange={(e) =>
                patch({
                  min_value:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              className="h-8 w-32 text-sm"
            />
          </SettingBlock>
          <SettingBlock label="Maximum value">
            <Input
              type="number"
              value={p.max_value ?? ""}
              onChange={(e) =>
                patch({
                  max_value:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              className="h-8 w-32 text-sm"
            />
          </SettingBlock>
        </>
      );
    case "multiple_choice":
    case "picture_choice":
    case "dropdown":
      return (
        <>
          {field.kind !== "dropdown" && (
            <SettingRow label="Allow multiple selections">
              <Switch
                checked={p.allow_multiple ?? false}
                onCheckedChange={(v) => patch({ allow_multiple: v })}
              />
            </SettingRow>
          )}
          {field.kind === "multiple_choice" && (
            <>
              <SettingRow label={'"Other" write-in option'}>
                <Switch
                  checked={p.allow_other ?? false}
                  onCheckedChange={(v) => patch({ allow_other: v })}
                />
              </SettingRow>
              <SettingRow label={'"None of the above" option'}>
                <Switch
                  checked={p.allow_none ?? false}
                  onCheckedChange={(v) => patch({ allow_none: v })}
                />
              </SettingRow>
            </>
          )}
          <SettingRow label="Randomize order">
            <Switch
              checked={p.randomize ?? false}
              onCheckedChange={(v) => patch({ randomize: v })}
            />
          </SettingRow>
        </>
      );
    case "rating":
      return (
        <>
          <SettingBlock label="Scale (2–10)">
            <Input
              type="number"
              min={2}
              max={10}
              value={p.rating_max ?? 5}
              onChange={(e) =>
                patch({
                  rating_max: Math.min(
                    10,
                    Math.max(2, Number(e.target.value) || 5),
                  ),
                })
              }
              className="h-8 w-24 text-sm"
            />
          </SettingBlock>
          <SettingBlock label="Shape">
            <Select
              value={p.rating_shape ?? "star"}
              onValueChange={(v) =>
                patch({ rating_shape: v as "star" | "heart" | "number" })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="star">Stars</SelectItem>
                <SelectItem value="heart">Hearts</SelectItem>
                <SelectItem value="number">Numbers</SelectItem>
              </SelectContent>
            </Select>
          </SettingBlock>
        </>
      );
    case "opinion_scale":
      return (
        <>
          <SettingBlock label="Scale (2–10)">
            <Input
              type="number"
              min={2}
              max={10}
              value={p.rating_max ?? 5}
              onChange={(e) =>
                patch({
                  rating_max: Math.min(
                    10,
                    Math.max(2, Number(e.target.value) || 5),
                  ),
                })
              }
              className="h-8 w-24 text-sm"
            />
          </SettingBlock>
          <SettingBlock label="Left label">
            <Input
              value={p.left_label ?? ""}
              onChange={(e) => patch({ left_label: e.target.value })}
              className="h-8 text-sm"
            />
          </SettingBlock>
          <SettingBlock label="Center label">
            <Input
              value={p.center_label ?? ""}
              onChange={(e) => patch({ center_label: e.target.value })}
              className="h-8 text-sm"
            />
          </SettingBlock>
          <SettingBlock label="Right label">
            <Input
              value={p.right_label ?? ""}
              onChange={(e) => patch({ right_label: e.target.value })}
              className="h-8 text-sm"
            />
          </SettingBlock>
        </>
      );
    case "matrix":
      return (
        <>
          <SettingBlock label="Rows">
            <RowListEditor
              items={p.rows ?? []}
              onChange={(rows) => patch({ rows })}
              addLabel="Add row"
            />
          </SettingBlock>
          <SettingBlock label="Columns">
            <RowListEditor
              items={p.columns ?? []}
              onChange={(columns) => patch({ columns })}
              addLabel="Add column"
            />
          </SettingBlock>
        </>
      );
    case "statement_voting":
      return (
        <>
          <SettingBlock label="Statements">
            <RowListEditor
              items={p.statements ?? []}
              onChange={(statements) => patch({ statements })}
              addLabel="Add statement"
            />
          </SettingBlock>
          <SettingBlock label="Vote labels">
            <div className="flex flex-col gap-1.5">
              <Input
                value={p.agree_label ?? ""}
                onChange={(e) => patch({ agree_label: e.target.value })}
                placeholder="Agree"
                className="h-8 text-sm"
              />
              <Input
                value={p.disagree_label ?? ""}
                onChange={(e) => patch({ disagree_label: e.target.value })}
                placeholder="Disagree"
                className="h-8 text-sm"
              />
              <Input
                value={p.unsure_label ?? ""}
                onChange={(e) => patch({ unsure_label: e.target.value })}
                placeholder="Unsure"
                className="h-8 text-sm"
              />
            </div>
          </SettingBlock>
        </>
      );
    case "ai_interview":
      return (
        <>
          <SettingBlock label="Interview goal (steers follow-up questions)">
            <Textarea
              value={p.interview_goal ?? ""}
              onChange={(e) => patch({ interview_goal: e.target.value })}
              placeholder="e.g. Understand what a good response looks like to this person and why"
              rows={3}
              className="text-sm"
            />
          </SettingBlock>
          <SettingBlock label="Max follow-up questions (0–5)">
            <Input
              type="number"
              min={0}
              max={5}
              value={p.max_follow_ups ?? 2}
              onChange={(e) =>
                patch({
                  max_follow_ups: Math.min(
                    5,
                    Math.max(0, Number(e.target.value) || 0),
                  ),
                })
              }
              className="h-8 w-24 text-sm"
            />
          </SettingBlock>
          <p className="text-xs text-muted-foreground">
            Follow-ups use the project&apos;s default LLM connection. Without
            one, respondents see a plain text box.
          </p>
        </>
      );
    case "response_comparison":
      return (
        <>
          <SettingBlock label="Responses to compare">
            <StimuliEditor
              items={p.stimuli ?? []}
              onChange={(stimuli) => patch({ stimuli })}
              withPrompt={false}
              minItems={2}
            />
          </SettingBlock>
          <SettingRow label="Ask which is preferred">
            <Switch
              checked={p.ask_preference ?? false}
              onCheckedChange={(v) => patch({ ask_preference: v })}
            />
          </SettingRow>
          <SettingRow label="Allow a comment">
            <Switch
              checked={p.allow_comment ?? false}
              onCheckedChange={(v) => patch({ allow_comment: v })}
            />
          </SettingRow>
        </>
      );
    case "stimulus_rating":
      return (
        <>
          <SettingBlock label="Stimuli to rate">
            <StimuliEditor
              items={p.stimuli ?? []}
              onChange={(stimuli) => patch({ stimuli })}
              withPrompt
              minItems={1}
            />
          </SettingBlock>
          <SettingRow label="Allow a comment per stimulus">
            <Switch
              checked={p.allow_comment ?? false}
              onCheckedChange={(v) => patch({ allow_comment: v })}
            />
          </SettingRow>
        </>
      );
    case "crowdpoll":
      return (
        <SettingBlock label="Crowdpoll embed URL">
          <Input
            value={p.embed_url ?? ""}
            onChange={(e) => patch({ embed_url: e.target.value })}
            placeholder="https://…"
            className="h-8 text-sm"
          />
        </SettingBlock>
      );
    default:
      return null;
  }
}

export function BuilderRightPanel({
  field,
  dispatch,
}: {
  field: FormField | undefined;
  dispatch: Dispatch<BuilderAction>;
}) {
  if (!field) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        Select a page to edit its settings.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <SettingBlock label="Question type">
        <Select
          value={field.kind}
          onValueChange={(next) => {
            const kind = next as FieldKind;
            // Seed the new kind's defaults, but keep anything the user
            // already configured (e.g. choices survive a switch to dropdown).
            const defaults = blankField(kind, field.id).properties ?? {};
            dispatch({
              type: "updateField",
              id: field.id,
              patch: {
                kind,
                properties: { ...defaults, ...field.properties },
              },
            });
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {FIELD_KIND_GROUPS.flatMap((group) => group.kinds).map((kind) => (
              <SelectItem key={kind} value={kind}>
                {FIELD_KIND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingBlock>

      {isQuestion(field.kind) && (
        <SettingRow label="Required">
          <Switch
            checked={field.required ?? false}
            onCheckedChange={(v) =>
              dispatch({
                type: "updateField",
                id: field.id,
                patch: { required: v },
              })
            }
          />
        </SettingRow>
      )}

      <Separator />

      <KindSpecificSettings field={field} dispatch={dispatch} />
    </div>
  );
}
