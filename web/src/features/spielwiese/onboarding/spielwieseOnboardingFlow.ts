export const ONBOARDING_QUESTIONS = [
  {
    id: "role",
    prompt: "Do you know what to build?",
    options: ["Yes", "No"],
  },
  {
    id: "intent",
    prompt: "Why are you opening this room?",
    options: ["Explore ideas", "Shape a workflow", "Review an agent"],
  },
  {
    id: "opening",
    prompt: "What should feel strongest first?",
    options: ["Focus", "Guidance", "Speed"],
  },
] as const;

export type OnboardingAnswerKey = (typeof ONBOARDING_QUESTIONS)[number]["id"];
export type OnboardingAnswers = Record<OnboardingAnswerKey, string>;

export const EMPTY_ONBOARDING_ANSWERS: OnboardingAnswers = {
  role: "",
  intent: "",
  opening: "",
};
export const PERSONAL_DETAILS_STEP_ID = "personal-details";

export function getOnboardingStartPath() {
  return "/dev/spielwiese/onboarding";
}

export function getOnboardingPersonalDetailsPath() {
  return `${getOnboardingStartPath()}/${PERSONAL_DETAILS_STEP_ID}`;
}

export function getSpielwieseDashboardPath() {
  return "/dev/spielwiese/dashboard";
}

export function getOnboardingStepIndex(stepId?: string) {
  const stepIndex = ONBOARDING_QUESTIONS.findIndex(
    (question) => question.id === stepId,
  );

  return stepIndex === -1 ? 0 : stepIndex;
}

export function getActiveOnboardingStepIndex(
  answers: OnboardingAnswers,
  requestedStepId?: string,
) {
  const requestedStepIndex = getOnboardingStepIndex(requestedStepId);
  const firstIncompleteStepIndex = ONBOARDING_QUESTIONS.findIndex(
    (question) => !answers[question.id],
  );
  const maxAllowedStepIndex =
    firstIncompleteStepIndex === -1
      ? ONBOARDING_QUESTIONS.length - 1
      : firstIncompleteStepIndex;

  return Math.min(requestedStepIndex, maxAllowedStepIndex);
}

export function getOnboardingStepPath(stepId: OnboardingAnswerKey) {
  return `/dev/spielwiese/onboarding/${stepId}`;
}

export function getOnboardingProgressValue(
  stepId: OnboardingAnswerKey | typeof PERSONAL_DETAILS_STEP_ID,
) {
  switch (stepId) {
    case PERSONAL_DETAILS_STEP_ID:
      return 12.5;
    case "role":
      return 37.5;
    case "intent":
      return 62.5;
    case "opening":
      return 87.5;
  }
}

export function getOnboardingCompletionCount(answers: OnboardingAnswers) {
  return ONBOARDING_QUESTIONS.reduce(
    (count, question) => count + Number(Boolean(answers[question.id])),
    0,
  );
}

export function getOnboardingSummary(answers: OnboardingAnswers) {
  const completionCount = getOnboardingCompletionCount(answers);

  if (completionCount === 0) {
    return "Three short questions shape the room before you enter.";
  }

  const fragments = [
    answers.role ? answers.role.toLowerCase() : null,
    answers.intent ? answers.intent.toLowerCase() : null,
    answers.opening ? answers.opening.toLowerCase() : null,
  ].filter(Boolean);

  return `${completionCount} of ${ONBOARDING_QUESTIONS.length} answered. ${fragments.join(" / ")}.`;
}
