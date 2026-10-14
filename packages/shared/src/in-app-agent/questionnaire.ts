import z from "zod";

export const IN_APP_AGENT_QUESTIONNAIRE_MAX_QUESTIONS = 5;
export const IN_APP_AGENT_QUESTIONNAIRE_MAX_OPTIONS = 6;

// Every field is required (nullable instead of optional) so the schema stays
// valid for OpenAI strict tool calling. Questions and options are addressed by
// position, so the model never has to invent ids.
const InAppAgentQuestionnaireOptionSchema = z.object({
  label: z.string().min(1).max(200),
  description: z
    .string()
    .max(500)
    .nullable()
    .describe("One short sentence explaining the option, or null."),
  recommended: z
    .boolean()
    .describe("Mark at most one option per question as recommended."),
});

const InAppAgentQuestionnaireQuestionSchema = z.object({
  question: z.string().min(1).max(500),
  options: z
    .array(InAppAgentQuestionnaireOptionSchema)
    .max(IN_APP_AGENT_QUESTIONNAIRE_MAX_OPTIONS)
    .describe("Answer options. Pass [] for a free-text question."),
  allowMultiple: z
    .boolean()
    .describe("Whether the user may select more than one option."),
  allowOther: z
    .boolean()
    .describe("Whether the user may type a custom answer besides the options."),
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

/** One entry per question, in question order. An empty entry means skipped. */
export const InAppAgentQuestionnaireAnswersSchema = z
  .array(
    z.object({
      selectedOptionIndexes: z
        .array(z.number().int().nonnegative())
        .max(IN_APP_AGENT_QUESTIONNAIRE_MAX_OPTIONS),
      otherText: z.string().max(2000).nullable(),
    }),
  )
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

  const parsedAnswers = InAppAgentQuestionnaireAnswersSchema.safeParse(answers);
  if (!parsedAnswers.success) {
    return { success: false, error: "Invalid questionnaire answers." };
  }

  const { questions } = parsedArgs.data;
  if (parsedAnswers.data.length !== questions.length) {
    return {
      success: false,
      error: "Expected exactly one answer entry per question.",
    };
  }

  const resolved: InAppAgentQuestionnaireResult["answers"] = [];
  for (const [index, question] of questions.entries()) {
    const answer = resolveAnswer(question, parsedAnswers.data[index]);
    if (answer === null) {
      return {
        success: false,
        error: `Invalid answer for question ${index + 1}.`,
      };
    }
    resolved.push({
      question: question.question,
      answer,
      skipped: answer.length === 0,
    });
  }

  return {
    success: true,
    result: { type: "questionnaireAnswers", answers: resolved },
  };
}

function resolveAnswer(
  question: InAppAgentQuestionnaireQuestion,
  answer: InAppAgentQuestionnaireAnswer,
): string[] | null {
  const { selectedOptionIndexes } = answer;
  const otherText = answer.otherText?.trim() || null;

  const isOutOfRange = selectedOptionIndexes.some(
    (optionIndex) => optionIndex >= question.options.length,
  );
  const hasDuplicates =
    new Set(selectedOptionIndexes).size !== selectedOptionIndexes.length;
  if (isOutOfRange || hasDuplicates) {
    return null;
  }

  const acceptsText = question.allowOther || question.options.length === 0;
  if (otherText !== null && !acceptsText) {
    return null;
  }

  const answerCount = selectedOptionIndexes.length + (otherText ? 1 : 0);
  if (!question.allowMultiple && answerCount > 1) {
    return null;
  }

  const labels = selectedOptionIndexes.map(
    (optionIndex) => question.options[optionIndex].label,
  );
  return otherText === null ? labels : [...labels, otherText];
}
