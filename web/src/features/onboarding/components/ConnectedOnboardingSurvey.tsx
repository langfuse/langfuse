import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { showErrorToast } from "@/src/features/notifications";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { getDemoCallbackRedirectPath } from "../lib/demoCallbackRedirect";
import {
  getSurveySubmittedEvent,
  shuffleBuildIntentOptions,
} from "../lib/buildIntent";
import type { SurveyFormData } from "../lib/surveyTypes";
import { OnboardingSurvey } from "./OnboardingSurvey";

export function ConnectedOnboardingSurvey() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const onboardingStatus = api.onboarding.status.useQuery();
  const completeOnboardingMutation = api.onboarding.complete.useMutation();
  const queryRedirectPath = router.isReady
    ? (getDemoCallbackRedirectPath(router.query.targetPath) ??
      getDemoCallbackRedirectPath(router.query.callbackUrl))
    : undefined;
  const [hasStartedOnboardingCompletion, setHasStartedOnboardingCompletion] =
    useState(false);
  const [onboardingOpenedAt] = useState(() => Date.now());
  const [buildIntentOptions] = useState(shuffleBuildIntentOptions);

  const [finishOnboarding, isFinishingOnboarding] = useWatchedPromiseCallback(
    async (data: SurveyFormData) => {
      setHasStartedOnboardingCompletion(true);

      try {
        const referralSource = data.referralSource?.trim();
        const canConfigureAiFeatures =
          onboardingStatus.data?.completed === false &&
          onboardingStatus.data.canConfigureAiFeatures;
        const buildIntents = data.buildIntents;
        const buildIntentOther = data.buildIntentOther?.trim();
        const onboardingResult = await completeOnboardingMutation.mutateAsync({
          ...(referralSource ? { referralSource } : {}),
          ...(canConfigureAiFeatures
            ? { aiFeaturesEnabled: data.aiFeaturesEnabled }
            : {}),
          ...(buildIntents.length > 0
            ? {
                buildIntents,
                buildIntentPositions: buildIntents.map((id) =>
                  buildIntentOptions.findIndex((option) => option.id === id),
                ),
              }
            : {}),
          ...(buildIntentOther ? { buildIntentOther } : {}),
        });
        const surveySubmittedEvent = getSurveySubmittedEvent({
          surveyCreated: onboardingResult.surveyCreated,
          buildIntents,
          hasReferralSource: Boolean(referralSource),
          surveyDurationMs: Date.now() - onboardingOpenedAt,
        });
        if (surveySubmittedEvent) {
          capture(
            "onboarding:signup_survey_submitted",
            surveySubmittedEvent.properties,
            surveySubmittedEvent.options,
          );
        }
        const redirectTo = queryRedirectPath ?? onboardingResult.redirectTo;
        utils.onboarding.status.setData(undefined, {
          completed: true,
          redirectTo,
        });
        await updateSession();
        await router.replace(redirectTo);
      } catch (error) {
        setHasStartedOnboardingCompletion(false);
        showErrorToast(
          "Failed to finish onboarding",
          error instanceof Error ? error.message : "Please try again.",
          classifyTrpcToastError(error, "onboarding.complete"),
        );
      }
    },
    [
      capture,
      onboardingOpenedAt,
      buildIntentOptions,
      completeOnboardingMutation,
      onboardingStatus.data,
      queryRedirectPath,
      router,
      updateSession,
      utils,
    ],
  );

  const [redirectCompletedOnboarding, isRedirectingCompletedOnboarding] =
    useWatchedPromiseCallback(
      async (redirectTo: string) => {
        setHasStartedOnboardingCompletion(true);

        try {
          await router.replace(redirectTo);
        } catch (error) {
          setHasStartedOnboardingCompletion(false);
          showErrorToast(
            "Failed to continue onboarding",
            error instanceof Error ? error.message : "Please try again.",
            {
              operation: "onboarding.continue",
              errorOrigin: "frontend",
              errorCategory: "internal",
            },
          );
        }
      },
      [router],
    );

  useEffect(() => {
    if (
      router.isReady &&
      onboardingStatus.data?.completed &&
      !hasStartedOnboardingCompletion
    ) {
      redirectCompletedOnboarding(
        queryRedirectPath ?? onboardingStatus.data.redirectTo,
      ).catch(() => undefined);
    }
  }, [
    hasStartedOnboardingCompletion,
    onboardingStatus.data,
    queryRedirectPath,
    redirectCompletedOnboarding,
    router.isReady,
  ]);

  const onSubmit = useCallback(
    async (data: SurveyFormData) => {
      await finishOnboarding(data);
    },
    [finishOnboarding],
  );

  const isCompletingOnboarding =
    hasStartedOnboardingCompletion ||
    isFinishingOnboarding ||
    isRedirectingCompletedOnboarding ||
    !router.isReady ||
    onboardingStatus.isLoading ||
    onboardingStatus.data?.completed === true;

  if (isCompletingOnboarding) {
    return <OnboardingSurvey state="completing" />;
  }

  if (onboardingStatus.isError) {
    return <OnboardingSurvey state="error" />;
  }

  return (
    <OnboardingSurvey
      state="form"
      buildIntentOptions={buildIntentOptions}
      canConfigureAiFeatures={
        onboardingStatus.data?.completed === false
          ? onboardingStatus.data.canConfigureAiFeatures
          : false
      }
      onSubmit={onSubmit}
    />
  );
}
