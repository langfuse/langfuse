export type QuestionType = "radio" | "text";

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  question: string;
  required?: boolean;
}

export interface RadioQuestion extends BaseQuestion {
  type: "radio";
  options: string[];
}

export interface TextQuestion extends BaseQuestion {
  type: "text";
  placeholder?: string;
}

export type SurveyQuestion = RadioQuestion | TextQuestion;

export interface SurveyState {
  currentStep: number;
}

export type SurveyAction =
  | { type: "next" }
  | { type: "back" }
  | { type: "goToStep"; step: number };

export interface SurveyFormData {
  role?: string;
  signupReason?: string;
  referralSource?: string;
}

export interface SurveyStepProps {
  question: SurveyQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  onNext?: () => void;
  showNext?: boolean;
  isLast?: boolean;
}
