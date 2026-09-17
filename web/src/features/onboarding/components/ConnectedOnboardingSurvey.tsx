import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { showErrorToast } from "@/src/features/notifications";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { api } from "@/src/utils/api";
import { getSafeRedirectPath, stripBasePath } from "@/src/utils/redirect";
import type { SurveyFormData } from "../lib/surveyTypes";
import { OnboardingSurvey } from "./OnboardingSurvey";

const getCallbackPath = (url: string): string | null => {
  if (typeof window === "undefined") return null;
  if (!/^(\/|https?:\/\/)/i.test(url)) return null;

  try {
    const parsedUrl = new URL(url, window.location.origin);
    if (parsedUrl.origin !== window.location.origin) return null;
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return null;
  }
};

const getDemoCallbackRedirectPath = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const callbackPath = getCallbackPath(value);
  if (!callbackPath) return undefined;
  const redirectPath = stripBasePath(getSafeRedirectPath(callbackPath));
  return redirectPath === "/demo" ? redirectPath : undefined;
};

export function ConnectedOnboardingSurvey() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const utils = api.useUtils();
  const onboardingStatus = api.onboarding.status.useQuery();
  const completeOnboardingMutation = api.onboarding.complete.useMutation();
  const queryRedirectPath =
    getDemoCallbackRedirectPath(router.query.targetPath) ??
    getDemoCallbackRedirectPath(router.query.callbackUrl);
  const [hasStartedOnboardingCompletion, setHasStartedOnboardingCompletion] =
    useState(false);

  const [finishOnboarding, isFinishingOnboarding] = useWatchedPromiseCallback(
    async (data: SurveyFormData) => {
      setHasStartedOnboardingCompletion(true);

      try {
        const referralSource = data.referralSource?.trim();
        const canConfigureAiFeatures =
          onboardingStatus.data?.completed === false &&
          onboardingStatus.data.canConfigureAiFeatures;
        const onboardingResult = await completeOnboardingMutation.mutateAsync(
          referralSource || canConfigureAiFeatures
            ? {
                ...(referralSource ? { referralSource } : {}),
                ...(canConfigureAiFeatures
                  ? { aiFeaturesEnabled: data.aiFeaturesEnabled }
                  : {}),
              }
            : undefined,
        );
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
        );
      }
    },
    [
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
          );
        }
      },
      [router],
    );

  useEffect(() => {
    if (onboardingStatus.data?.completed && !hasStartedOnboardingCompletion) {
      redirectCompletedOnboarding(
        queryRedirectPath ?? onboardingStatus.data.redirectTo,
      ).catch(() => undefined);
    }
  }, [
    hasStartedOnboardingCompletion,
    onboardingStatus.data,
    queryRedirectPath,
    redirectCompletedOnboarding,
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
      canConfigureAiFeatures={
        onboardingStatus.data?.completed === false
          ? onboardingStatus.data.canConfigureAiFeatures
          : false
      }
      onSubmit={onSubmit}
    />
  );
}
