import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { api } from "@/src/utils/api";

export type OnboardingCompletionInput = {
  referralSource?: string;
  newsletterOptIn?: boolean;
};

/**
 * Owns the shared tail of every onboarding step: persist the survey row, refresh
 * the session, and navigate to wherever the server says this user belongs.
 *
 * Shared by the Langfuse Cloud referral survey and the self-hosted newsletter
 * step, which differ only in what they render before calling `finishOnboarding`.
 */
export function useCompleteOnboarding() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const utils = api.useUtils();
  const onboardingStatus = api.onboarding.status.useQuery();
  const completeOnboardingMutation = api.onboarding.complete.useMutation();
  const [hasStartedOnboardingCompletion, setHasStartedOnboardingCompletion] =
    useState(false);

  const [finishOnboarding, isFinishingOnboarding] = useWatchedPromiseCallback(
    async (input?: OnboardingCompletionInput) => {
      setHasStartedOnboardingCompletion(true);

      try {
        const onboardingResult =
          await completeOnboardingMutation.mutateAsync(input);
        utils.onboarding.status.setData(undefined, {
          completed: true,
          redirectTo: onboardingResult.redirectTo,
        });
        await updateSession();
        await router.replace(onboardingResult.redirectTo);
      } catch (error) {
        setHasStartedOnboardingCompletion(false);
        showErrorToast(
          "Failed to finish onboarding",
          error instanceof Error ? error.message : "Please try again.",
        );
      }
    },
    [completeOnboardingMutation, router, updateSession, utils],
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

  // External system: the Next.js router. A user who already completed
  // onboarding must be pushed out of the flow rather than shown a step again.
  useEffect(() => {
    if (onboardingStatus.data?.completed && !hasStartedOnboardingCompletion) {
      redirectCompletedOnboarding(onboardingStatus.data.redirectTo).catch(
        () => undefined,
      );
    }
  }, [
    hasStartedOnboardingCompletion,
    onboardingStatus.data,
    redirectCompletedOnboarding,
  ]);

  const isCompletingOnboarding =
    hasStartedOnboardingCompletion ||
    isFinishingOnboarding ||
    isRedirectingCompletedOnboarding ||
    onboardingStatus.isLoading ||
    onboardingStatus.data?.completed === true;

  return {
    finishOnboarding,
    isCompletingOnboarding,
    // Exposed separately so a step can show a neutral loading state instead of
    // claiming it is already finishing, which `isCompletingOnboarding` folds in.
    isStatusLoading: onboardingStatus.isLoading,
    isStatusError: onboardingStatus.isError,
  };
}
