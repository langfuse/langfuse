import type { SurveyQuestion } from "./surveyTypes";

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "referralSource",
    type: "text",
    question: "Where did you hear about us?",
    placeholder: "Colleague, Word of Mouth, X, Reddit, Event",
  },
];

export const TOTAL_STEPS = SURVEY_QUESTIONS.length;
