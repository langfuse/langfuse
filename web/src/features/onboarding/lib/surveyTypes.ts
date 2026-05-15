export interface SurveyQuestion {
  id: "referralSource";
  question: string;
  placeholder?: string;
}

export interface SurveyFormData {
  referralSource?: string;
}
