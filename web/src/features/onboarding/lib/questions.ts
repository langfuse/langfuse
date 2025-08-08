import type { SurveyQuestion } from "./surveyTypes";

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "role",
    type: "radio",
    question: "What describes you best?",
    options: [
      "Software Engineer",
      "ML Engineer / Data Scientist",
      "Product Manager",
      "Domain Expert",
      "Executive or Manager",
      "Other",
    ],
  },
  {
    id: "signupReason",
    type: "radio",
    question: "Why are you signing up?",
    options: [
      "Invited by team",
      "Just looking around",
      "Evaluating / Testing Langfuse",
      "Start using Langfuse",
      "Migrating from other solution",
      "Migrating from self-hosted",
    ],
  },
  {
    id: "referralSource",
    type: "text",
    question: "Where did you hear about us?",
    placeholder: "GitHub, X, Reddit, colleague etc.",
  },
];

export const TOTAL_STEPS = SURVEY_QUESTIONS.length;
