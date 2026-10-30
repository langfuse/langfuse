import type { BuildIntentId } from "./buildIntent";

export interface SurveyFormData {
  referralSource?: string;
  aiFeaturesEnabled: boolean;
  buildIntents: BuildIntentId[];
  buildIntentOther?: string;
}
