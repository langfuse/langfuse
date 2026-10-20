import z from "zod";

export const IN_APP_AGENT_QUESTIONNAIRE_MAX_QUESTIONS = 4;
export const IN_APP_AGENT_QUESTIONNAIRE_MIN_OPTIONS = 2;
export const IN_APP_AGENT_QUESTIONNAIRE_MAX_OPTIONS = 4;
export const IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH = 2000;

// Every field is required (nullable instead of optional) so the schema stays
// valid for OpenAI strict tool calling. Questions and options are addressed by
// position, so the model never has to invent ids.
const InAppAgentQuestionnaireOptionSchema = z.object({
  label: z.string().min(1).max(200),
  description: z
    .string()
    .max(500)
    .refine((description) => description.trim().length > 0, {
      message: "Give every option a description.",
    })
    .describe("One short sentence explaining the option."),
  recommended: z
    .boolean()
    .describe("Mark at most one option per question as recommended."),
});

const InAppAgentQuestionnaireQuestionSchema = z.object({
  question: z.string().min(1).max(500),
  options: z
    .array(InAppAgentQuestionnaireOptionSchema)
    .min(IN_APP_AGENT_QUESTIONNAIRE_MIN_OPTIONS)
    .max(IN_APP_AGENT_QUESTIONNAIRE_MAX_OPTIONS)
    .refine(
      (options) => options.filter((option) => option.recommended).length <= 1,
      { message: "Mark at most one option per question as recommended." },
    )
    .describe(
      `${IN_APP_AGENT_QUESTIONNAIRE_MIN_OPTIONS} to ${IN_APP_AGENT_QUESTIONNAIRE_MAX_OPTIONS} distinct answer options, each with a description. Do not add an "Other" option; the user can always type a custom answer.`,
    ),
  allowMultiple: z
    .boolean()
    .describe("Whether the user may select more than one option."),
});

export const InAppAgentQuestionnaireArgsSchema = z.object({
  questions: z
    .array(InAppAgentQuestionnaireQuestionSchema)
    .min(1)
    .max(IN_APP_AGENT_QUESTIONNAIRE_MAX_QUESTIONS),
});

export type InAppAgentQuestionnaireArgs = z.infer<
  typeof InAppAgentQuestionnaireArgsSchema
>;

export type InAppAgentQuestionnaireQuestion =
  InAppAgentQuestionnaireArgs["questions"][number];

const InAppAgentQuestionnaireAnswerSchema = z.object({
  selectedOptionIndexes: z
    .array(z.number().int().nonnegative())
    .max(IN_APP_AGENT_QUESTIONNAIRE_MAX_OPTIONS)
    .refine((indexes) => new Set(indexes).size === indexes.length, {
      message: "Select each option at most once.",
    }),
  otherText: z
    .string()
    .max(IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH)
    .nullable(),
});

/** One entry per question, in question order. An empty entry means skipped. */
export const InAppAgentQuestionnaireAnswersSchema = z
  .array(InAppAgentQuestionnaireAnswerSchema)
  .max(IN_APP_AGENT_QUESTIONNAIRE_MAX_QUESTIONS);

export type InAppAgentQuestionnaireAnswers = z.infer<
  typeof InAppAgentQuestionnaireAnswersSchema
>;

export type InAppAgentQuestionnaireAnswer =
  InAppAgentQuestionnaireAnswers[number];

export const InAppAgentQuestionnaireResultSchema = z.object({
  type: z.literal("questionnaireAnswers"),
  answers: z.array(
    z.object({
      question: z.string(),
      answer: z.array(z.string()),
      skipped: z.boolean(),
    }),
  ),
});

export type InAppAgentQuestionnaireResult = z.infer<
  typeof InAppAgentQuestionnaireResultSchema
>;

/**
 * Answers schema bound to the questions the model asked. Parsing checks every
 * answer against its question and outputs the tool result the model reads.
 */
export function createInAppAgentQuestionnaireAnswersSchema(
  questions: readonly InAppAgentQuestionnaireQuestion[],
) {
  return InAppAgentQuestionnaireAnswersSchema.length(questions.length, {
    message: "Expected exactly one answer entry per question.",
  })
    .superRefine((answers, ctx) => {
      if (answers.length !== questions.length) {
        return;
      }
      for (const [index, question] of questions.entries()) {
        if (!isValidAnswer(question, answers[index])) {
          ctx.addIssue({
            code: "custom",
            path: [index],
            message: `Invalid answer for question ${index + 1}.`,
          });
        }
      }
    })
    .transform(
      (answers): InAppAgentQuestionnaireResult => ({
        type: "questionnaireAnswers",
        answers: questions.map((question, index) => {
          const answer = toAnswerLabels(question, answers[index]);
          return {
            question: question.question,
            answer,
            skipped: answer.length === 0,
          };
        }),
      }),
    );
}

/**
 * Validates user answers against the questions the model asked and turns
 * them into the tool result the model reads. Shared by the decision endpoint
 * (to reject bad input early) and the worker tool execution.
 */
export function resolveInAppAgentQuestionnaireAnswers({
  args,
  answers,
}: {
  args: unknown;
  answers: unknown;
}):
  | { success: true; result: InAppAgentQuestionnaireResult }
  | { success: false; error: string } {
  const parsedArgs = InAppAgentQuestionnaireArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    return { success: false, error: "Invalid questionnaire questions." };
  }

  const parsedAnswers = createInAppAgentQuestionnaireAnswersSchema(
    parsedArgs.data.questions,
  ).safeParse(answers);
  if (!parsedAnswers.success) {
    return {
      success: false,
      error:
        parsedAnswers.error.issues[0]?.message ??
        "Invalid questionnaire answers.",
    };
  }

  return { success: true, result: parsedAnswers.data };
}

function getOtherText(answer: InAppAgentQuestionnaireAnswer): string | null {
  return answer.otherText?.trim() || null;
}

function isValidAnswer(
  question: InAppAgentQuestionnaireQuestion,
  answer: InAppAgentQuestionnaireAnswer,
): boolean {
  const { selectedOptionIndexes } = answer;
  const isOutOfRange = selectedOptionIndexes.some(
    (optionIndex) => optionIndex >= question.options.length,
  );
  if (isOutOfRange) {
    return false;
  }

  const answerCount =
    selectedOptionIndexes.length + (getOtherText(answer) ? 1 : 0);
  return question.allowMultiple || answerCount <= 1;
}

function toAnswerLabels(
  question: InAppAgentQuestionnaireQuestion,
  answer: InAppAgentQuestionnaireAnswer,
): string[] {
  const labels = answer.selectedOptionIndexes.map(
    (optionIndex) => question.options[optionIndex].label,
  );
  const otherText = getOtherText(answer);
  return otherText === null ? labels : [...labels, otherText];
}
