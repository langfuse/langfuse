import { useCallback, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
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
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";
import { useSurveyForm } from "../hooks/useSurveyForm";
import type { SurveyFormData } from "../lib/surveyTypes";

export function OnboardingSurvey() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const { form, handleSubmit } = useSurveyForm();
  const completeOnboardingMutation = api.onboarding.complete.useMutation();
  const [isFinishingOnboarding, setIsFinishingOnboarding] = useState(false);

  const finishOnboarding = useCallback(async () => {
    if (isFinishingOnboarding) {
      return;
    }

    setIsFinishingOnboarding(true);

    try {
      const onboardingResult = await completeOnboardingMutation.mutateAsync();
      await updateSession();
      await router.replace(onboardingResult.redirectTo);
    } catch (error) {
      showErrorToast(
        "Failed to finish onboarding",
        error instanceof Error ? error.message : "Please try again.",
      );
      setIsFinishingOnboarding(false);
    }
  }, [
    completeOnboardingMutation,
    isFinishingOnboarding,
    router,
    updateSession,
  ]);

  const handleSkipButton = useCallback(() => {
    void finishOnboarding();
  }, [finishOnboarding]);

  const onSubmit = useCallback(
    async (data: SurveyFormData) => {
      if (!data.referralSource?.trim()) {
        handleSkipButton();
        return;
      }

      await handleSubmit(data);
      await finishOnboarding();
    },
    [finishOnboarding, handleSkipButton, handleSubmit],
  );

  const currentValue = form.watch("referralSource");

  const isEmpty = (v: unknown) =>
    v == null || (typeof v === "string" && v.trim() === "");
  const currentEmpty = isEmpty(currentValue);
  const showSkip = currentEmpty;

  if (isFinishingOnboarding) {
    return (
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-start sm:px-6 sm:py-12 lg:px-8">
        <div className="flex items-center justify-center gap-2 sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon className="h-8 w-8" />
        </div>

        <div className="bg-background mt-6 rounded-lg px-6 py-10 shadow-sm sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[480px] sm:px-12 sm:py-12">
          <div className="flex flex-col items-center text-center">
            <Spinner size="xl" variant="muted" />
            <h1 className="mt-6 text-xl font-semibold">
              Setting up your project
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Taking you to tracing...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-start sm:px-6 sm:py-12 lg:px-8">
      <div className="flex items-center justify-center gap-2 sm:mx-auto sm:w-full sm:max-w-md">
        <LangfuseIcon className="h-8 w-8" />
      </div>

      <div className="bg-background mt-6 rounded-lg px-6 py-6 shadow-sm sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[480px] sm:px-12 sm:py-10">
        <Form {...form}>
          <form
            className="flex h-full flex-col"
            onSubmit={form.handleSubmit(onSubmit)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && currentEmpty) {
                event.preventDefault();
                handleSkipButton();
              }
            }}
          >
            <div className="flex-1">
              <FormField
                control={form.control}
                name="referralSource"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2">
                    <FormLabel className="text-xl font-semibold">
                      Where did you hear about us?
                    </FormLabel>
                    <FormControl>
                      <Input
                        autoFocus
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
                  onClick={handleSkipButton}
                  variant="ghost"
                  className="w-20"
                  disabled={isFinishingOnboarding}
                >
                  Skip
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="default"
                  className="w-20"
                  disabled={isFinishingOnboarding}
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
