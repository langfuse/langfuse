/**
 * CIP fork feature (see FORK.md): the Elicitations field contract.
 *
 * Ported from product-platform's `libs/studio-feature-elicitations/src/schemas.ts`
 * and extended with the Weval Surveys section kinds (matrix, ranking, statement
 * voting, dropdown) and the AI-driven kinds (interview, response comparison,
 * stimulus rating, crowdpoll embed).
 *
 * Field kinds are grouped into *families*. Siblings in a family share answer
 * shape and validation; a new sibling is added to `FIELD_KINDS` and its family
 * array (heyform's `RATING_FIELD_KINDS` / `CHOICES_FIELD_KINDS` pattern —
 * concepts only, no AGPL source is copied).
 *
 * `validateAnswer` is shared by the public renderer (refuse a bad answer before
 * a round trip) and the tRPC submit procedure (the server re-checks regardless).
 */
import { z } from "zod/v4";

const Id = z.string().min(1);

export const FIELD_KINDS = [
  // Screens
  "welcome",
  "statement",
  "thank_you",
  // Text & number
  "short_text",
  "long_text",
  "number",
  // Choices
  "multiple_choice",
  "picture_choice",
  "yes_no",
  "dropdown",
  // Scales
  "rating",
  "opinion_scale",
  // Date
  "date",
  // Weval Surveys grids
  "matrix",
  "ranking",
  "statement_voting",
  // AI-driven Weval sections
  "ai_interview",
  "response_comparison",
  "stimulus_rating",
  "crowdpoll",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** Display-only screens — no answer is collected. */
export const STATEMENT_FIELD_KINDS = [
  "welcome",
  "statement",
  "thank_you",
] as const satisfies readonly FieldKind[];

/** Free-text inputs answered with a string. */
export const TEXT_FIELD_KINDS = [
  "short_text",
  "long_text",
] as const satisfies readonly FieldKind[];

/** Choice lists with an options array. */
export const CHOICES_FIELD_KINDS = [
  "multiple_choice",
  "picture_choice",
  "dropdown",
] as const satisfies readonly FieldKind[];

/** Ordinal numeric scales sharing the integer 1..rating_max answer shape. */
export const RATING_FIELD_KINDS = [
  "rating",
  "opinion_scale",
] as const satisfies readonly FieldKind[];

/** Weval grid kinds answered with a per-row / per-statement record. */
export const GRID_FIELD_KINDS = [
  "matrix",
  "statement_voting",
] as const satisfies readonly FieldKind[];

/** AI-driven kinds with structured object answers. */
export const AI_FIELD_KINDS = [
  "ai_interview",
  "response_comparison",
  "stimulus_rating",
] as const satisfies readonly FieldKind[];

/** Kinds that collect an answer. Derived so a new sibling lands here automatically. */
export const QUESTION_FIELD_KINDS = [
  ...TEXT_FIELD_KINDS,
  "number",
  "yes_no",
  ...CHOICES_FIELD_KINDS,
  ...RATING_FIELD_KINDS,
  "date",
  ...GRID_FIELD_KINDS,
  "ranking",
  ...AI_FIELD_KINDS,
] as const satisfies readonly FieldKind[];

function kindIn<T extends FieldKind>(
  kind: FieldKind,
  family: readonly T[],
): kind is T {
  return (family as readonly FieldKind[]).includes(kind);
}

export const isStatementField = (kind: FieldKind) =>
  kindIn(kind, STATEMENT_FIELD_KINDS);
export const isTextField = (kind: FieldKind) => kindIn(kind, TEXT_FIELD_KINDS);
export const isChoicesField = (kind: FieldKind) =>
  kindIn(kind, CHOICES_FIELD_KINDS);
export const isRatingField = (kind: FieldKind) =>
  kindIn(kind, RATING_FIELD_KINDS);
export const isQuestion = (kind: FieldKind) =>
  kindIn(kind, QUESTION_FIELD_KINDS);

/** Human labels for the field-kind picker. */
export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  welcome: "Welcome screen",
  statement: "Statement",
  thank_you: "Thank-you screen",
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  multiple_choice: "Multiple choice",
  picture_choice: "Picture choice",
  yes_no: "Yes / No",
  dropdown: "Dropdown",
  rating: "Rating",
  opinion_scale: "Opinion scale",
  date: "Date",
  matrix: "Matrix",
  ranking: "Ranking",
  statement_voting: "Statement voting",
  ai_interview: "AI interview",
  response_comparison: "Response comparison",
  stimulus_rating: "Stimulus rating",
  crowdpoll: "Crowdpoll embed",
};

/**
 * Picker groups for the builder's Add menu. Order is the menu order; each
 * group's `kinds` are siblings that belong together in the UI.
 */
export const FIELD_KIND_GROUPS: ReadonlyArray<{
  label: string;
  kinds: readonly FieldKind[];
}> = [
  { label: "Screens", kinds: STATEMENT_FIELD_KINDS },
  { label: "Text & number", kinds: [...TEXT_FIELD_KINDS, "number"] },
  { label: "Choices", kinds: ["yes_no", ...CHOICES_FIELD_KINDS] },
  { label: "Scales", kinds: RATING_FIELD_KINDS },
  { label: "Date", kinds: ["date"] },
  { label: "Grids & ranking", kinds: [...GRID_FIELD_KINDS, "ranking"] },
  { label: "AI-driven", kinds: [...AI_FIELD_KINDS, "crowdpoll"] },
];

export const ChoiceSchema = z.object({
  id: Id,
  label: z.string(),
  image_url: z.string().optional(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

/** A matrix row or a statement in statement voting. */
export const RowSchema = z.object({ id: Id, label: z.string() });
export type Row = z.infer<typeof RowSchema>;

/** One model response shown in comparison / stimulus-rating screens. */
export const StimulusSchema = z.object({
  id: Id,
  /** Optional prompt/context shown above the response. */
  prompt: z.string().optional(),
  /** The content the respondent reacts to. */
  content: z.string(),
});
export type Stimulus = z.infer<typeof StimulusSchema>;

export const STATEMENT_VOTE_VALUES = ["agree", "disagree", "unsure"] as const;
export type StatementVote = (typeof STATEMENT_VOTE_VALUES)[number];

export const FieldPropertiesSchema = z.object({
  placeholder: z.string().optional(),
  /** Button label on statement/welcome screens. */
  button_text: z.string().optional(),
  /** Seconds before Next enables on statement/welcome screens. */
  min_read_seconds: z.number().int().min(0).max(300).optional(),

  // Choices / ranking
  choices: z.array(ChoiceSchema).optional(),
  allow_multiple: z.boolean().optional(),
  allow_other: z.boolean().optional(),
  /** Exclusive "None of the above" option for choice fields. */
  allow_none: z.boolean().optional(),
  randomize: z.boolean().optional(),

  // Scales
  rating_max: z.number().int().min(2).max(10).optional(),
  rating_shape: z.enum(["star", "heart", "number"]).optional(),
  left_label: z.string().optional(),
  center_label: z.string().optional(),
  right_label: z.string().optional(),

  // Text / number constraints
  min_chars: z.number().int().min(0).optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),

  // Matrix
  rows: z.array(RowSchema).optional(),
  columns: z.array(RowSchema).optional(),

  // Statement voting
  statements: z.array(RowSchema).optional(),
  agree_label: z.string().optional(),
  disagree_label: z.string().optional(),
  unsure_label: z.string().optional(),

  // AI interview
  /** What the interviewer is trying to learn; steers follow-up questions. */
  interview_goal: z.string().optional(),
  max_follow_ups: z.number().int().min(0).max(5).optional(),

  // Response comparison / stimulus rating
  stimuli: z.array(StimulusSchema).optional(),
  /** Ask which response the respondent prefers (comparison only). */
  ask_preference: z.boolean().optional(),
  /** Offer an optional free-text comment per stimulus. */
  allow_comment: z.boolean().optional(),

  // Crowdpoll
  embed_url: z.string().optional(),
});
export type FieldProperties = z.infer<typeof FieldPropertiesSchema>;

export const FormFieldSchema = z.object({
  id: Id,
  kind: z.enum(FIELD_KINDS),
  title: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  properties: FieldPropertiesSchema.optional(),
});
export type FormField = z.infer<typeof FormFieldSchema>;

export const FormFieldsSchema = z.array(FormFieldSchema);

export const FormSettingsSchema = z.object({
  show_progress: z.boolean().optional(),
  closed_title: z.string().optional(),
  closed_description: z.string().optional(),
});
export type FormSettings = z.infer<typeof FormSettingsSchema>;

export const ELICITATION_STATUSES = ["draft", "open", "closed"] as const;
export type ElicitationStatus = (typeof ELICITATION_STATUSES)[number];

/** Status is derived from timestamps, never stored. */
export function deriveStatus(e: {
  publishedAt: Date | string | null;
  closedAt: Date | string | null;
}): ElicitationStatus {
  if (e.closedAt) return "closed";
  if (e.publishedAt) return "open";
  return "draft";
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export const AiInterviewAnswerSchema = z.object({
  initial: z.string(),
  final: z.string().optional(),
  exchanges: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
});
export type AiInterviewAnswer = z.infer<typeof AiInterviewAnswerSchema>;

export const ComparisonAnswerSchema = z.object({
  /** stimulus id -> 1..5 rating */
  ratings: z.record(z.string(), z.number().int().min(1).max(5)),
  preferred: z.string().optional(),
  comment: z.string().optional(),
});
export type ComparisonAnswer = z.infer<typeof ComparisonAnswerSchema>;

export const StimulusRatingAnswerSchema = z.record(
  z.string(),
  z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().optional(),
  }),
);
export type StimulusRatingAnswer = z.infer<typeof StimulusRatingAnswerSchema>;

const AnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  // matrix: row id -> column id; statement voting: statement id -> vote
  z.record(z.string(), z.string()),
  AiInterviewAnswerSchema,
  ComparisonAnswerSchema,
  StimulusRatingAnswerSchema,
]);
export type AnswerValue = z.infer<typeof AnswerValueSchema> | null;

export const AnswerSchema = z.object({
  field_id: Id,
  kind: z.enum(FIELD_KINDS),
  value: AnswerValueSchema.nullable(),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const AnswersSchema = z.array(AnswerSchema);

/** Reserved id for the exclusive "None of the above" choice. */
export const NONE_CHOICE_ID = "__none__";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Why an answer is not valid for its field, or `null` if it is. Arms are keyed
 * by *family* where siblings share a shape, so adding a sibling kind only
 * requires listing it in the family const — not a new case here.
 */
export function validateAnswer(
  field: FormField,
  value: AnswerValue,
): string | null {
  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (isPlainRecord(value) && Object.keys(value).length === 0);
  if (empty) return field.required ? `"${field.title}" is required.` : null;

  if (isTextField(field.kind) || field.kind === "date") {
    if (typeof value !== "string") return `"${field.title}" expects text.`;
    const minChars = field.properties?.min_chars ?? 0;
    if (isTextField(field.kind) && value.trim().length < minChars) {
      return `"${field.title}" needs at least ${minChars} characters.`;
    }
    return null;
  }
  if (field.kind === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return `"${field.title}" expects a number.`;
    }
    const { min_value, max_value } = field.properties ?? {};
    if (min_value !== undefined && value < min_value) {
      return `"${field.title}" must be at least ${min_value}.`;
    }
    if (max_value !== undefined && value > max_value) {
      return `"${field.title}" must be at most ${max_value}.`;
    }
    return null;
  }
  if (field.kind === "yes_no") {
    return typeof value === "boolean"
      ? null
      : `"${field.title}" expects yes or no.`;
  }
  if (isRatingField(field.kind)) {
    const max = field.properties?.rating_max ?? 5;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > max
    ) {
      return `"${field.title}" expects a rating between 1 and ${max}.`;
    }
    return null;
  }
  if (isChoicesField(field.kind)) {
    if (!Array.isArray(value))
      return `"${field.title}" expects one or more choices.`;
    const allowed = new Set((field.properties?.choices ?? []).map((c) => c.id));
    const allowOther = field.properties?.allow_other ?? false;
    const allowNone = field.properties?.allow_none ?? false;
    const hasNone = value.includes(NONE_CHOICE_ID);
    if (hasNone && !allowNone) {
      return `"${field.title}" does not offer a none option.`;
    }
    if (hasNone && value.length > 1) {
      return `"${field.title}"'s none option can't be combined with other choices.`;
    }
    const otherValues = value.filter(
      (v) => v !== NONE_CHOICE_ID && !allowed.has(v),
    );
    if (otherValues.length > 0 && !allowOther) {
      return `"${field.title}" has a choice that no longer exists.`;
    }
    if (otherValues.length > 1) {
      return `"${field.title}" takes a single other response.`;
    }
    if (otherValues.some((v) => v.trim() === "")) {
      return `"${field.title}" needs an other response.`;
    }
    if (!field.properties?.allow_multiple && value.length > 1) {
      return `"${field.title}" takes a single choice.`;
    }
    return null;
  }
  if (field.kind === "ranking") {
    if (!Array.isArray(value)) return `"${field.title}" expects a ranking.`;
    const ids = new Set((field.properties?.choices ?? []).map((c) => c.id));
    if (value.some((v) => !ids.has(v))) {
      return `"${field.title}" has a ranked item that no longer exists.`;
    }
    if (new Set(value).size !== value.length) {
      return `"${field.title}" ranks an item twice.`;
    }
    if (field.required && value.length !== ids.size) {
      return `"${field.title}" requires every item to be ranked.`;
    }
    return null;
  }
  if (field.kind === "matrix") {
    if (!isPlainRecord(value))
      return `"${field.title}" expects a selection per row.`;
    const rowIds = new Set((field.properties?.rows ?? []).map((r) => r.id));
    const colIds = new Set((field.properties?.columns ?? []).map((c) => c.id));
    for (const [rowId, colId] of Object.entries(value)) {
      if (
        !rowIds.has(rowId) ||
        typeof colId !== "string" ||
        !colIds.has(colId)
      ) {
        return `"${field.title}" has an invalid selection.`;
      }
    }
    if (field.required && Object.keys(value).length !== rowIds.size) {
      return `"${field.title}" requires an answer for every row.`;
    }
    return null;
  }
  if (field.kind === "statement_voting") {
    if (!isPlainRecord(value))
      return `"${field.title}" expects a vote per statement.`;
    const stmtIds = new Set(
      (field.properties?.statements ?? []).map((s) => s.id),
    );
    for (const [stmtId, vote] of Object.entries(value)) {
      if (
        !stmtIds.has(stmtId) ||
        typeof vote !== "string" ||
        !(STATEMENT_VOTE_VALUES as readonly string[]).includes(vote)
      ) {
        return `"${field.title}" has an invalid vote.`;
      }
    }
    if (field.required && Object.keys(value).length !== stmtIds.size) {
      return `"${field.title}" requires a vote on every statement.`;
    }
    return null;
  }
  if (field.kind === "ai_interview") {
    return AiInterviewAnswerSchema.safeParse(value).success
      ? null
      : `"${field.title}" expects an interview answer.`;
  }
  if (field.kind === "response_comparison") {
    const parsed = ComparisonAnswerSchema.safeParse(value);
    if (!parsed.success) return `"${field.title}" expects comparison ratings.`;
    const stimulusIds = new Set(
      (field.properties?.stimuli ?? []).map((s) => s.id),
    );
    const keys = Object.keys(parsed.data.ratings);
    if (keys.some((k) => !stimulusIds.has(k))) {
      return `"${field.title}" rates a response that no longer exists.`;
    }
    if (field.required && keys.length !== stimulusIds.size) {
      return `"${field.title}" requires a rating for every response.`;
    }
    return null;
  }
  if (field.kind === "stimulus_rating") {
    const parsed = StimulusRatingAnswerSchema.safeParse(value);
    if (!parsed.success) return `"${field.title}" expects stimulus ratings.`;
    const stimulusIds = new Set(
      (field.properties?.stimuli ?? []).map((s) => s.id),
    );
    const keys = Object.keys(parsed.data);
    if (keys.some((k) => !stimulusIds.has(k))) {
      return `"${field.title}" rates a stimulus that no longer exists.`;
    }
    if (field.required && keys.length !== stimulusIds.size) {
      return `"${field.title}" requires a rating for every stimulus.`;
    }
    return null;
  }
  if (field.kind === "crowdpoll") {
    // Participation happens in the embedded poll; nothing is captured here.
    return null;
  }
  return `"${field.title}" does not take an answer.`;
}

// ---------------------------------------------------------------------------
// Builder defaults
// ---------------------------------------------------------------------------

let blankSeq = 0;
export function newFieldId(): string {
  blankSeq += 1;
  return `f_${Date.now().toString(36)}_${blankSeq.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/** A fresh field of the given kind, with sensible defaults for its properties. */
export function blankField(kind: FieldKind, id: string): FormField {
  const base: FormField = { id, kind, title: defaultTitle(kind) };
  if (isChoicesField(kind) || kind === "ranking") {
    return {
      ...base,
      properties: {
        choices: [
          { id: `${id}_a`, label: "Option 1" },
          { id: `${id}_b`, label: "Option 2" },
        ],
        ...(kind === "multiple_choice" ? { allow_multiple: false } : {}),
      },
    };
  }
  if (kind === "opinion_scale") {
    return {
      ...base,
      properties: {
        rating_max: 5,
        left_label: "Strongly disagree",
        center_label: "Neutral",
        right_label: "Strongly agree",
      },
    };
  }
  if (kind === "rating") {
    return { ...base, properties: { rating_max: 5, rating_shape: "star" } };
  }
  if (kind === "matrix") {
    return {
      ...base,
      properties: {
        rows: [
          { id: `${id}_r1`, label: "Row 1" },
          { id: `${id}_r2`, label: "Row 2" },
        ],
        columns: [
          { id: `${id}_c1`, label: "Disagree" },
          { id: `${id}_c2`, label: "Neutral" },
          { id: `${id}_c3`, label: "Agree" },
        ],
      },
    };
  }
  if (kind === "statement_voting") {
    return {
      ...base,
      properties: {
        statements: [
          { id: `${id}_s1`, label: "The first statement to vote on" },
        ],
      },
    };
  }
  if (kind === "ai_interview") {
    return {
      ...base,
      properties: { max_follow_ups: 2, interview_goal: "" },
    };
  }
  if (kind === "response_comparison") {
    return {
      ...base,
      properties: {
        stimuli: [
          { id: `${id}_a`, content: "First response" },
          { id: `${id}_b`, content: "Second response" },
        ],
        ask_preference: true,
      },
    };
  }
  if (kind === "stimulus_rating") {
    return {
      ...base,
      properties: {
        stimuli: [{ id: `${id}_a`, prompt: "", content: "The stimulus" }],
        allow_comment: true,
      },
    };
  }
  if (kind === "crowdpoll") {
    return { ...base, properties: { embed_url: "" } };
  }
  return base;
}

function defaultTitle(kind: FieldKind): string {
  switch (kind) {
    case "welcome":
      return "Welcome";
    case "thank_you":
      return "Thank you!";
    case "statement":
      return "A statement for your respondents";
    case "opinion_scale":
      return "How much do you agree?";
    case "matrix":
      return "Rate each row";
    case "ranking":
      return "Rank the options";
    case "statement_voting":
      return "Vote on each statement";
    case "ai_interview":
      return "Tell us in your own words";
    case "response_comparison":
      return "Compare the responses";
    case "stimulus_rating":
      return "Rate the response";
    case "crowdpoll":
      return "Join the discussion";
    default:
      return "Your question";
  }
}
