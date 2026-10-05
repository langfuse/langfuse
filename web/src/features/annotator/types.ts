import { z } from "zod";

const AnnotationOptionSchema = z.object({
  value: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  shortcut: z.string().max(1).optional(),
});

const AnnotationQuestionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(["single_choice", "boolean", "scale", "text"]),
  label: z.string().min(1).max(180),
  helpText: z.string().max(500).optional(),
  required: z.boolean(),
  options: z.array(AnnotationOptionSchema).max(8).optional(),
  min: z.number().int().min(0).max(10).optional(),
  max: z.number().int().min(1).max(10).optional(),
  placeholder: z.string().max(160).optional(),
});

const GeneratedQuestionBase = {
  id: z.string(),
  label: z.string(),
  helpText: z.string().optional(),
  required: z.boolean(),
};

const GeneratedAnnotationQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    ...GeneratedQuestionBase,
    type: z.literal("single_choice"),
    options: z.array(AnnotationOptionSchema),
  }),
  z.object({
    ...GeneratedQuestionBase,
    type: z.literal("boolean"),
  }),
  z.object({
    ...GeneratedQuestionBase,
    type: z.literal("scale"),
    min: z.number().int(),
    max: z.number().int(),
  }),
  z.object({
    ...GeneratedQuestionBase,
    type: z.literal("text"),
    placeholder: z.string().optional(),
  }),
]);

export const AnnotationViewSpecGenerationSchema = z.object({
  schemaVersion: z.literal("1"),
  catalogVersion: z.literal("annotator-v1"),
  title: z.string(),
  summary: z.string(),
  layout: z.enum(["conversation", "input_output"]),
  evidence: z.array(z.enum(["input", "output", "metadata"])),
  instructions: z.array(z.string()),
  assistance: z.enum(["blind", "on_request", "after_first_pass"]),
  questions: z.array(GeneratedAnnotationQuestionSchema),
  submitLabel: z.string(),
});

export const AnnotationViewSpecSchema = z
  .object({
    schemaVersion: z.literal("1"),
    catalogVersion: z.literal("annotator-v1"),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(500),
    layout: z.enum(["conversation", "input_output"]),
    evidence: z
      .array(z.enum(["input", "output", "metadata"]))
      .min(1)
      .max(3),
    instructions: z.array(z.string().min(1).max(400)).min(1).max(5),
    assistance: z.enum(["blind", "on_request", "after_first_pass"]),
    questions: z.array(AnnotationQuestionSchema).min(1).max(8),
    submitLabel: z.string().min(1).max(40),
  })
  .superRefine((spec, ctx) => {
    const ids = new Set<string>();
    const shortcuts = new Set<string>();
    if (new Set(spec.evidence).size !== spec.evidence.length) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Evidence bindings must be unique",
      });
    }
    spec.questions.forEach((question, index) => {
      if (ids.has(question.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", index, "id"],
          message: "Question ids must be unique",
        });
      }
      ids.add(question.id);

      if (question.type === "single_choice") {
        if (!question.options || question.options.length < 2) {
          ctx.addIssue({
            code: "custom",
            path: ["questions", index, "options"],
            message: "Single-choice questions need at least two options",
          });
        }
        if (
          new Set(question.options?.map((option) => option.value)).size !==
          question.options?.length
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["questions", index, "options"],
            message: "Option values must be unique",
          });
        }
        question.options?.forEach((option) => {
          if (option.shortcut) {
            const shortcut = option.shortcut.toLowerCase();
            if (shortcuts.has(shortcut)) {
              ctx.addIssue({
                code: "custom",
                path: ["questions", index, "options"],
                message: "Keyboard shortcuts must be unique",
              });
            }
            shortcuts.add(shortcut);
          }
        });
      }

      if (
        question.type === "scale" &&
        (question.min === undefined ||
          question.max === undefined ||
          question.min >= question.max)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", index],
          message: "Scale questions need an increasing min and max",
        });
      }
    });
  });

export type AnnotationViewSpec = z.infer<typeof AnnotationViewSpecSchema>;
export type AnnotationQuestion = z.infer<typeof AnnotationQuestionSchema>;
export type AnnotationAnswer = string | number | boolean;
export type AnnotationAnswers = Record<string, AnnotationAnswer>;

export const STARTER_ANNOTATION_SPEC: AnnotationViewSpec = {
  schemaVersion: "1",
  catalogVersion: "annotator-v1",
  title: "Response quality review",
  summary:
    "Judge whether the response is correct, grounded in the supplied context, and useful to the end user.",
  layout: "conversation",
  evidence: ["input", "output"],
  instructions: [
    "Read the user input before opening technical details.",
    "Evaluate the response as written; do not repair it mentally.",
    "Flag examples that need subject-matter review instead of guessing.",
  ],
  assistance: "on_request",
  questions: [
    {
      id: "verdict",
      type: "single_choice",
      label: "What is the overall verdict?",
      helpText: "Choose the closest fit. Use the note for important nuance.",
      required: true,
      options: [
        { value: "pass", label: "Pass", shortcut: "1" },
        { value: "minor", label: "Minor issue", shortcut: "2" },
        { value: "major", label: "Major issue", shortcut: "3" },
      ],
    },
    {
      id: "grounded",
      type: "boolean",
      label: "Is the response grounded in the available evidence?",
      required: true,
    },
    {
      id: "confidence",
      type: "scale",
      label: "How confident are you?",
      required: true,
      min: 1,
      max: 5,
    },
    {
      id: "note",
      type: "text",
      label: "Reviewer note",
      helpText: "Optional. Explain only what another reviewer would need.",
      required: false,
      placeholder: "Add a concise note…",
    },
  ],
  submitLabel: "Submit & next",
};

export const AnnotationAnswersSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

export function validateAnswers(
  spec: AnnotationViewSpec,
  answers: AnnotationAnswers,
): string[] {
  const questionIds = new Set(spec.questions.map((question) => question.id));
  const errors: string[] = [];

  Object.keys(answers).forEach((id) => {
    if (!questionIds.has(id)) errors.push(`Unknown answer: ${id}`);
  });

  spec.questions.forEach((question) => {
    const answer = answers[question.id];
    if (question.required && (answer === undefined || answer === "")) {
      errors.push(`${question.label} is required`);
      return;
    }
    if (answer === undefined || answer === "") return;

    if (question.type === "single_choice") {
      if (
        typeof answer !== "string" ||
        !question.options?.some((option) => option.value === answer)
      ) {
        errors.push(`${question.label} has an invalid option`);
      }
    } else if (question.type === "boolean" && typeof answer !== "boolean") {
      errors.push(`${question.label} must be yes or no`);
    } else if (question.type === "scale") {
      if (
        typeof answer !== "number" ||
        question.min === undefined ||
        question.max === undefined ||
        answer < question.min ||
        answer > question.max
      ) {
        errors.push(`${question.label} is outside the allowed range`);
      }
    } else if (question.type === "text" && typeof answer !== "string") {
      errors.push(`${question.label} must be text`);
    }
  });

  return errors;
}
