import { useForm } from "react-hook-form";
import { useCallback } from "react";
import type { SurveyFormData } from "../lib/surveyTypes";
import { SURVEY_QUESTION } from "../lib/questions";
import { api } from "@/src/utils/api";
import { SurveyName } from "@prisma/client";
import { useSession } from "next-auth/react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

export function useSurveyForm() {
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
      referralSource: undefined,
    },
  });

  const handleSubmit = useCallback(
    async (data: SurveyFormData) => {
      const transformedResponse: Record<string, string> = {};
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
    question: SURVEY_QUESTION,
    handleSubmit,
  };
}
