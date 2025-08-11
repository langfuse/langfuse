import type { SurveyState, SurveyAction } from "./surveyTypes";
import { TOTAL_STEPS } from "./questions";

export const initialSurveyState: SurveyState = {
  currentStep: 0,
};

export function surveyReducer(
  state: SurveyState,
  action: SurveyAction,
): SurveyState {
  switch (action.type) {
    case "next":
      return {
        ...state,
        currentStep: Math.min(state.currentStep + 1, TOTAL_STEPS - 1),
      };
    case "back":
      return {
        ...state,
        currentStep: Math.max(state.currentStep - 1, 0),
      };
    case "goToStep":
      return {
        ...state,
        currentStep: Math.max(0, Math.min(action.step, TOTAL_STEPS - 1)),
      };
    default:
      return state;
  }
}
