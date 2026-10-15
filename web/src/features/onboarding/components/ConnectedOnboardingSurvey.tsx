import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { env } from "@/src/env.mjs";
import { showErrorToast } from "@/src/features/notifications";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import { reportError } from "@/src/utils/reportError";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import {
  getDeepLinkCallbackRedirectPath,
  getDemoCallbackRedirectPath,
} from "../lib/demoCallbackRedirect";
import {
  getSurveySubmittedEvent,
  shuffleBuildIntentOptions,
} from "../lib/buildIntent";
import { getFallbackRedirectPath } from "../lib/fallbackRedirect";
import {
  type NewsletterList,
  type NewsletterOutcome,
} from "../lib/newsletterSignup";
import type { SurveyFormData } from "../lib/surveyTypes";
import { useNewsletterSignup } from "../hooks/useNewsletterSignup";
import { NewsletterOptIn, type NewsletterOptInValues } from "./NewsletterOptIn";
import { OnboardingSurvey } from "./OnboardingSurvey";

export function ConnectedOnboardingSurvey() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  // Self-hosted reports a failed step and moves on (below), so its default error toasts stay off.
  const onboardingStatus = api.onboarding.status.useQuery(undefined, {
    meta: { silentAllErrors: !isLangfuseCloud },
  });
  const completeOnboardingMutation = api.onboarding.complete.useMutation(
    isLangfuseCloud ? undefined : { onError: () => undefined },
  );
  /** Cloud forwards demo links only; self-hosted forwards any same-origin deep link. */
  const getQueryRedirectPath = isLangfuseCloud
    ? getDemoCallbackRedirectPath
    : getDeepLinkCallbackRedirectPath;
  const queryRedirectPath = router.isReady
    ? (getQueryRedirectPath(router.query.targetPath) ??
      getQueryRedirectPath(router.query.callbackUrl))
    : undefined;
  const [hasStartedOnboardingCompletion, setHasStartedOnboardingCompletion] =
    useState(false);
  const [onboardingOpenedAt] = useState(() => Date.now());
  const [buildIntentOptions] = useState(shuffleBuildIntentOptions);
  const newsletterLists =
    onboardingStatus.data?.completed === false
      ? onboardingStatus.data.newsletterLists
      : undefined;
  /** Where self-hosted goes when the step fails: the deep link, else the shared fallback. The demo org doesn't count, as on the server. */
  const fallbackDestination =
    queryRedirectPath ??
    getFallbackRedirectPath({
      hasOrganizations:
        session?.user?.organizations.some(
          (organization) => organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID,
        ) ?? false,
      canCreateOrganizations: session?.user?.canCreateOrganizations ?? false,
    });

  /** On self-hosted, a failed client-side redirect falls back to loading the same path. */
  const replaceRoute = useCallback(
    async (path: string) => {
      try {
        await router.replace(path);
      } catch (error) {
        if (isLangfuseCloud) throw error;
        reportError(error, {
          area: "onboarding",
          warnMessage: "Onboarding redirect failed; loading the page instead",
        });
        // The client-side router just failed, so a full page load is the fallback.
        const destination = new URL(
          `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`,
          window.location.origin,
        );
        window.location.assign(destination.href);
      }
    },
    [isLangfuseCloud, router],
  );

  const [completeOnboarding, isFinishingOnboarding] = useWatchedPromiseCallback(
    async (
      input: OnboardingCompletionInput,
      onCompleted?: (result: OnboardingCompletionResult) => void,
    ) => {
      setHasStartedOnboardingCompletion(true);
      let redirectTo: string | undefined;

      try {
        const onboardingResult =
          await completeOnboardingMutation.mutateAsync(input);
        onCompleted?.(onboardingResult);
        redirectTo = queryRedirectPath ?? onboardingResult.redirectTo;
        utils.onboarding.status.setData(undefined, {
          completed: true,
          redirectTo,
        });
        await updateSession();
        await replaceRoute(redirectTo);
      } catch (error) {
        if (!isLangfuseCloud) {
          reportError(error, {
            area: "onboarding",
            warnMessage: "Saving the onboarding step failed; continuing",
          });
          await replaceRoute(redirectTo ?? fallbackDestination);
          return;
        }
        setHasStartedOnboardingCompletion(false);
        showErrorToast(
          "Failed to finish onboarding",
          error instanceof Error ? error.message : "Please try again.",
          classifyTrpcToastError(error, "onboarding.complete"),
        );
      }
    },
    [
      completeOnboardingMutation,
      fallbackDestination,
      isLangfuseCloud,
      queryRedirectPath,
      replaceRoute,
      updateSession,
      utils,
    ],
  );

  const [redirectCompletedOnboarding, isRedirectingCompletedOnboarding] =
    useWatchedPromiseCallback(
      async (redirectTo: string) => {
        setHasStartedOnboardingCompletion(true);

        try {
          await replaceRoute(redirectTo);
        } catch (error) {
          // Only Cloud gets here; self-hosted falls back to loading the page.
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
      [replaceRoute],
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

  useEffect(() => {
    if (
      isLangfuseCloud ||
      !router.isReady ||
      !onboardingStatus.isError ||
      hasStartedOnboardingCompletion
    ) {
      return;
    }

    reportError(onboardingStatus.error, {
      area: "onboarding",
      warnMessage: "Loading the onboarding status failed; continuing",
    });
    setHasStartedOnboardingCompletion(true);
    replaceRoute(fallbackDestination).catch(() => undefined);
  }, [
    fallbackDestination,
    hasStartedOnboardingCompletion,
    isLangfuseCloud,
    onboardingStatus.error,
    onboardingStatus.isError,
    replaceRoute,
    router.isReady,
  ]);

  const onSubmit = useCallback(
    async (data: SurveyFormData) => {
      const referralSource = data.referralSource?.trim();
      const canConfigureAiFeatures =
        onboardingStatus.data?.completed === false &&
        onboardingStatus.data.canConfigureAiFeatures;
      const buildIntents = data.buildIntents;
      const buildIntentOther = data.buildIntentOther?.trim();
      const captureSurveySubmitted = ({
        surveyCreated,
      }: OnboardingCompletionResult) => {
        const surveySubmittedEvent = getSurveySubmittedEvent({
          surveyCreated,
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
      };

      await completeOnboarding(
        {
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
        },
        captureSurveySubmitted,
      );
    },
    [
      buildIntentOptions,
      capture,
      completeOnboarding,
      onboardingOpenedAt,
      onboardingStatus.data,
    ],
  );

  const completeNewsletterStep = (outcome: NewsletterOutcome) =>
    completeOnboarding({ newsletter: { outcome } });

  const isLoadingOnboarding = !router.isReady || onboardingStatus.isLoading;
  const isCompletingOnboarding =
    hasStartedOnboardingCompletion ||
    isFinishingOnboarding ||
    isRedirectingCompletedOnboarding ||
    isLoadingOnboarding ||
    onboardingStatus.data?.completed === true;

  // A completed status the user didn't just finish here (step off, or done before) is only a redirect.
  const isBouncingCompletedOnboarding =
    onboardingStatus.data?.completed === true && !isFinishingOnboarding;

  if (
    !isLangfuseCloud &&
    (isLoadingOnboarding ||
      isBouncingCompletedOnboarding ||
      onboardingStatus.isError)
  ) {
    return <NewsletterOptIn state="loading" />;
  }

  // Stays mounted while completing, so Subscribe or Skip shows its progress; status flips only on success.
  if (newsletterLists) {
    return (
      <NewsletterOptInStep
        lists={newsletterLists}
        defaultEmail={session?.user?.email ?? ""}
        isCompleting={hasStartedOnboardingCompletion}
        onComplete={completeNewsletterStep}
      />
    );
  }

  if (isCompletingOnboarding) {
    return isLangfuseCloud ? (
      <OnboardingSurvey state="completing" />
    ) : (
      <NewsletterOptIn state="completing" />
    );
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

function NewsletterOptInStep({
  lists,
  defaultEmail,
  isCompleting,
  onComplete,
}: {
  lists: NewsletterList[];
  defaultEmail: string;
  isCompleting: boolean;
  onComplete: (outcome: NewsletterOutcome) => Promise<void>;
}) {
  const { reachability, subscribe } = useNewsletterSignup();
  const [hasSignupFailed, setHasSignupFailed] = useState(false);

  const subscribeWithAddress = async ({ email }: NewsletterOptInValues) => {
    const outcome = await subscribe({ email, lists });
    if (outcome === "failed") {
      setHasSignupFailed(true);
      return;
    }

    await onComplete(outcome);
  };

  const skipSignup = () => onComplete("declined");

  const continueWithoutSignup = () =>
    onComplete(hasSignupFailed ? "failed" : "unreachable");

  if (hasSignupFailed) {
    return (
      <NewsletterOptIn
        state="failed"
        lists={lists}
        isContinuing={isCompleting}
        onContinue={continueWithoutSignup}
      />
    );
  }

  switch (reachability) {
    case "checking":
      return <NewsletterOptIn state="loading" />;
    case "unreachable":
      return (
        <NewsletterOptIn
          state="unreachable"
          lists={lists}
          isContinuing={isCompleting}
          onContinue={continueWithoutSignup}
        />
      );
    case "reachable":
      return (
        <NewsletterOptIn
          state="form"
          lists={lists}
          defaultEmail={defaultEmail}
          onSubscribe={subscribeWithAddress}
          onSkip={skipSignup}
        />
      );
  }
}

type OnboardingCompletionInput = NonNullable<
  RouterInputs["onboarding"]["complete"]
>;
type OnboardingCompletionResult = RouterOutputs["onboarding"]["complete"];
