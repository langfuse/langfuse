import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";
import type { SurveyFormData } from "../lib/surveyTypes";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { getSafeRedirectPath, stripBasePath } from "@/src/utils/redirect";

const getSameOriginPath = (url: string): string | null => {
  if (typeof window === "undefined") return null;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== window.location.origin) return null;
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return null;
  }
};

const getQueryRedirectPath = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const sameOriginPath = getSameOriginPath(value);
  return stripBasePath(getSafeRedirectPath(sameOriginPath ?? value));
};

export function OnboardingSurvey() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const utils = api.useUtils();
  const form = useForm<SurveyFormData>({
    defaultValues: {
      referralSource: undefined,
    },
  });
  const onboardingStatus = api.onboarding.status.useQuery();
  const completeOnboardingMutation = api.onboarding.complete.useMutation();
  const queryRedirectPath = getQueryRedirectPath(router.query.targetPath);
  const [hasStartedOnboardingCompletion, setHasStartedOnboardingCompletion] =
    useState(false);

  const [finishOnboarding, isFinishingOnboarding] = useWatchedPromiseCallback(
    async (data?: SurveyFormData) => {
      setHasStartedOnboardingCompletion(true);

      try {
        const referralSource = data?.referralSource?.trim();
        const onboardingPayload =
          referralSource || queryRedirectPath
            ? {
                ...(referralSource ? { referralSource } : {}),
                ...(queryRedirectPath ? { targetPath: queryRedirectPath } : {}),
              }
            : undefined;
        const onboardingResult =
          await completeOnboardingMutation.mutateAsync(onboardingPayload);
        utils.onboarding.status.setData(undefined, {
          completed: true,
          redirectTo: queryRedirectPath ?? onboardingResult.redirectTo,
        });
        await updateSession();
        await router.replace(queryRedirectPath ?? onboardingResult.redirectTo);
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

  const currentValue = form.watch("referralSource");
  const isSubmittingSurvey = form.formState.isSubmitting;
  const isCompletingOnboarding =
    hasStartedOnboardingCompletion ||
    isFinishingOnboarding ||
    isRedirectingCompletedOnboarding ||
    onboardingStatus.isLoading ||
    onboardingStatus.data?.completed === true;
  const isBusy = isCompletingOnboarding || isSubmittingSurvey;

  const isEmpty = (v: unknown) =>
    v == null || (typeof v === "string" && v.trim() === "");
  const currentEmpty = isEmpty(currentValue);
  const showSkip = currentEmpty;

  if (isCompletingOnboarding) {
    return (
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-start sm:px-6 sm:py-12 lg:px-8">
        <div className="flex items-center justify-center gap-2 sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon size={32} />
        </div>

        <div className="bg-background mt-6 rounded-lg px-6 py-10 shadow-sm sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[480px] sm:px-12 sm:py-12">
          <div className="flex flex-col items-center text-center">
            <Spinner size="xl" variant="muted" />
            <h1 className="mt-6 text-xl font-bold">Setting up your project</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Taking you to tracing...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (onboardingStatus.isError) {
    return (
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-start sm:px-6 sm:py-12 lg:px-8">
        <div className="flex items-center justify-center gap-2 sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon size={32} />
        </div>

        <div className="bg-background mt-6 rounded-lg px-6 py-10 shadow-sm sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[480px] sm:px-12 sm:py-12">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-xl font-bold">Failed to load onboarding</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Refresh the page to try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-start sm:px-6 sm:py-12 lg:px-8">
      <div className="flex items-center justify-center gap-2 sm:mx-auto sm:w-full sm:max-w-md">
        <LangfuseIcon size={32} />
      </div>

      <div className="bg-background mt-6 rounded-lg px-6 py-6 shadow-sm sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[480px] sm:px-12 sm:py-10">
        <Form {...form}>
          <form
            className="flex h-full flex-col"
            onSubmit={form.handleSubmit(onSubmit)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && currentEmpty) {
                event.preventDefault();
                finishOnboarding(form.getValues()).catch(() => undefined);
              }
            }}
          >
            <div className="flex-1">
              <FormField
                control={form.control}
                name="referralSource"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2">
                    <FormLabel className="text-xl font-bold">
                      Where did you hear about us?
                    </FormLabel>
                    <FormControl>
                      <Input
                        autoFocus
                        maxLength={500}
                        placeholder="Colleague, Word of Mouth, X, Reddit, Event"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end pt-6">
              {showSkip ? (
                <Button
                  type="button"
                  onClick={() => {
                    finishOnboarding(form.getValues()).catch(() => undefined);
                  }}
                  variant="ghost"
                  className="w-20"
                  disabled={isBusy}
                >
                  Skip
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="default"
                  className="w-20"
                  disabled={isBusy}
                >
                  Finish
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
