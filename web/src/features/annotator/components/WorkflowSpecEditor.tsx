import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleDashed,
  Plus,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  AnnotationViewSpecSchema,
  type AnnotationQuestion,
  type AnnotationViewSpec,
} from "../types";

type WorkflowSpecEditorProps = {
  initialSpec: AnnotationViewSpec;
  initialVersion: number;
  status: "live" | "draft" | "published";
  saving: boolean;
  onSave: (spec: AnnotationViewSpec) => Promise<void>;
};

export function WorkflowSpecEditor({
  initialSpec,
  initialVersion,
  status,
  saving,
  onSave,
}: WorkflowSpecEditorProps) {
  const [draft, setDraft] = useState(initialSpec);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialSpec);

  const updateQuestion = (
    index: number,
    update: (question: AnnotationQuestion) => AnnotationQuestion,
  ) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? update(question) : question,
      ),
    }));
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.questions.length) {
        return current;
      }
      const questions = [...current.questions];
      const [question] = questions.splice(index, 1);
      questions.splice(destination, 0, question);
      return { ...current, questions };
    });
  };

  const validation = AnnotationViewSpecSchema.safeParse(draft);
  const versionLabel = formatVersionLabel(status, initialVersion);
  const validationMessage = getValidationMessage(validation, dirty);

  return (
    <Card className="overflow-hidden">
      <div className="bg-muted/30 flex items-start justify-between gap-4 border-b p-4">
        <div className="flex gap-3">
          {status === "live" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
          ) : (
            <CircleDashed className="text-primary mt-0.5 h-4 w-4" />
          )}
          <div>
            <p className="text-sm">{versionLabel}</p>
            <p className="text-foreground-secondary mt-1 text-xs leading-relaxed">
              {status === "draft"
                ? "This draft is not visible to annotators. Saving your edits creates another immutable draft."
                : "Editing never changes this version. Saving creates a new draft; annotators stay on the live version until you publish it."}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="Submit button">
            <Input
              value={draft.submitLabel}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  submitLabel: event.target.value,
                }))
              }
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            rows={3}
            value={draft.summary}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                summary: event.target.value,
              }))
            }
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Evidence layout">
            <select
              className="bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={draft.layout}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  layout: event.target.value as AnnotationViewSpec["layout"],
                }))
              }
            >
              <option value="conversation">Conversation</option>
              <option value="input_output">Input and output</option>
            </select>
          </Field>
          <Field label="AI assistance">
            <select
              className="bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={draft.assistance}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  assistance: event.target
                    .value as AnnotationViewSpec["assistance"],
                }))
              }
            >
              <option value="blind">Hidden</option>
              <option value="on_request">On request</option>
              <option value="after_first_pass">After first pass</option>
            </select>
          </Field>
        </div>

        <Field label="Guidelines" hint="One guideline per line">
          <Textarea
            rows={4}
            value={draft.instructions.join("\n")}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                instructions: event.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              }))
            }
          />
        </Field>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm">Questions</p>
              <p className="text-foreground-secondary text-xs">
                Reorder, edit, or add controls from the trusted catalog.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={draft.questions.length >= 8}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  questions: [
                    ...current.questions,
                    {
                      id: nextQuestionId(current.questions),
                      type: "single_choice",
                      label: "New question",
                      required: false,
                      options: [
                        { value: "yes", label: "Yes" },
                        { value: "no", label: "No" },
                      ],
                    },
                  ],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add question
            </Button>
          </div>

          <div className="space-y-3">
            {draft.questions.map((question, index) => (
              <div key={question.id} className="rounded-lg border p-3">
                <div className="mb-3 flex items-start gap-2">
                  <span className="text-foreground-tertiary mt-2 w-5 text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <Input
                      aria-label={`Question ${index + 1} label`}
                      value={question.label}
                      onChange={(event) =>
                        updateQuestion(index, (current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                    />
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <select
                        aria-label={`Question ${index + 1} type`}
                        className="bg-background h-9 rounded-md border px-3 text-sm"
                        value={question.type}
                        onChange={(event) =>
                          updateQuestion(index, (current) =>
                            changeQuestionType(
                              current,
                              event.target.value as AnnotationQuestion["type"],
                            ),
                          )
                        }
                      >
                        <option value="single_choice">Single choice</option>
                        <option value="boolean">Yes / no</option>
                        <option value="scale">Scale</option>
                        <option value="text">Text</option>
                      </select>
                      <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-xs">
                        <input
                          type="checkbox"
                          checked={question.required}
                          onChange={(event) =>
                            updateQuestion(index, (current) => ({
                              ...current,
                              required: event.target.checked,
                            }))
                          }
                        />
                        Required
                      </label>
                    </div>

                    {question.type === "single_choice" ? (
                      <Field label="Options" hint="One option per line">
                        <Textarea
                          rows={Math.max(2, question.options?.length ?? 2)}
                          value={question.options
                            ?.map((option) => option.label)
                            .join("\n")}
                          onChange={(event) =>
                            updateQuestion(index, (current) => ({
                              ...current,
                              options: parseOptions(
                                event.target.value,
                                current.options ?? [],
                              ),
                            }))
                          }
                        />
                      </Field>
                    ) : null}

                    {question.type === "scale" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Minimum">
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            value={question.min ?? 1}
                            onChange={(event) =>
                              updateQuestion(index, (current) => ({
                                ...current,
                                min: Number(event.target.value),
                              }))
                            }
                          />
                        </Field>
                        <Field label="Maximum">
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={question.max ?? 5}
                            onChange={(event) =>
                              updateQuestion(index, (current) => ({
                                ...current,
                                max: Number(event.target.value),
                              }))
                            }
                          />
                        </Field>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Move question up"
                      disabled={index === 0}
                      onClick={() => moveQuestion(index, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Move question down"
                      disabled={index === draft.questions.length - 1}
                      onClick={() => moveQuestion(index, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete question"
                      disabled={draft.questions.length === 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          questions: current.questions.filter(
                            (_, questionIndex) => questionIndex !== index,
                          ),
                        }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-destructive text-xs">{validationMessage}</p>
          <Button
            loading={saving}
            loadingText="Saving draft"
            disabled={!dirty || !validation.success}
            onClick={() => {
              if (!validation.success) return;
              onSave(validation.data).catch(() => undefined);
            }}
          >
            Save as new draft
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span>
        {label}
        {hint ? (
          <span className="text-foreground-tertiary ml-2 text-xs">{hint}</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function changeQuestionType(
  question: AnnotationQuestion,
  type: AnnotationQuestion["type"],
): AnnotationQuestion {
  if (type === "single_choice") {
    return {
      ...question,
      type,
      options: question.options ?? [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    };
  }
  if (type === "scale") {
    return {
      ...question,
      type,
      min: question.min ?? 1,
      max: question.max ?? 5,
    };
  }
  return { ...question, type };
}

function nextQuestionId(questions: AnnotationQuestion[]) {
  const ids = new Set(questions.map((question) => question.id));
  let index = questions.length + 1;
  while (ids.has(`question_${index}`)) index += 1;
  return `question_${index}`;
}

function parseOptions(
  value: string,
  previous: NonNullable<AnnotationQuestion["options"]>,
) {
  return value.split("\n").map((line, index) => {
    const label = line.trim();
    const existing = previous[index];
    return {
      value: existing?.value ?? slugify(label, index),
      label,
      ...(existing?.shortcut ? { shortcut: existing.shortcut } : {}),
    };
  });
}

function slugify(label: string, index: number) {
  const value = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return value || `option_${index + 1}`;
}

function formatVersionLabel(
  status: WorkflowSpecEditorProps["status"],
  version: number,
) {
  if (status === "live") return `Live version ${version}`;
  if (status === "published") return `Published version ${version}`;
  return `Draft version ${version}`;
}

function getValidationMessage(
  validation: ReturnType<typeof AnnotationViewSpecSchema.safeParse>,
  dirty: boolean,
) {
  if (!validation.success) return validation.error.issues[0]?.message;
  return dirty ? "Unsaved changes" : "";
}
