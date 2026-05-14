import { useForm } from "react-hook-form";
import { useReducer, useCallback } from "react";
import type { SurveyFormData } from "../lib/surveyTypes";
import { surveyReducer, initialSurveyState } from "../lib/surveyReducer";
import { SURVEY_QUESTIONS, TOTAL_STEPS } from "../lib/questions";
import { api } from "@/src/utils/api";
import { SurveyName } from "@prisma/client";
import { useSession } from "next-auth/react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

export function useSurveyForm() {
  const [state, dispatch] = useReducer(surveyReducer, initialSurveyState);
  const { data: session } = useSession();
  const createSurveyMutation = api.surveys.create.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Survey submitted",
        description: "Thank you for your feedback!",
      });
    },
    onError: (error) => {
      showErrorToast(
        "Failed to submit survey",
        error.message || "Please try again later.",
      );
    },
  });

  const form = useForm<SurveyFormData>({
    defaultValues: {
      role: undefined,
      referralSource: undefined,
    },
  });
  const currentQuestion = SURVEY_QUESTIONS[state.currentStep];

  const isLastStep = state.currentStep === TOTAL_STEPS - 1;
  const isFirstStep = state.currentStep === 0;

  const goNext = useCallback(() => {
    dispatch({ type: "next" });
  }, []);

  const goBack = useCallback(() => {
    dispatch({ type: "back" });
  }, []);

  const goToStep = useCallback((step: number) => {
    dispatch({ type: "goToStep", step });
  }, []);

  const handleAutoAdvance = useCallback(
    (selectedValue?: string) => {
      void selectedValue;
      goNext();
    },
    [goNext],
  );

  const handleSubmit = useCallback(
    async (data: SurveyFormData) => {
      const transformedResponse: Record<string, string> = {};
      if (data.role) transformedResponse["role"] = data.role;
      if (data.referralSource)
        transformedResponse["referralSource"] = data.referralSource.trim();

      try {
        await createSurveyMutation.mutateAsync({
          surveyName: SurveyName.USER_ONBOARDING,
          response: transformedResponse,
          orgId: session?.user?.organizations?.[0]?.id,
        });
      } catch {
        // Error handling is done in the mutation callbacks
        // This catch block is for any additional error handling if needed
      }
    },
    [createSurveyMutation, session],
  );

  return {
    form,
    state,
    currentQuestion,
    isLastStep,
    isFirstStep,
    goNext,
    goBack,
    goToStep,
    handleAutoAdvance,
    handleSubmit,
    totalSteps: TOTAL_STEPS,
  };
}
