import { useCallback } from "react";
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
import {
  OnboardingCard,
  OnboardingMessage,
} from "@/src/features/onboarding/components/OnboardingCard";
import { useCompleteOnboarding } from "@/src/features/onboarding/hooks/useCompleteOnboarding";
import type { SurveyFormData } from "../lib/surveyTypes";

/** Langfuse Cloud signup step: a single attribution question. */
export function OnboardingSurvey() {
  const form = useForm<SurveyFormData>({
    defaultValues: {
      referralSource: undefined,
    },
  });
  const { finishOnboarding, isCompletingOnboarding, isStatusError } =
    useCompleteOnboarding();

  const submitSurvey = useCallback(
    (data?: SurveyFormData) => {
      const referralSource = data?.referralSource?.trim();

      finishOnboarding(referralSource ? { referralSource } : undefined).catch(
        () => undefined,
      );
    },
    [finishOnboarding],
  );

  const onSubmit = useCallback(
    async (data: SurveyFormData) => {
      submitSurvey(data);
    },
    [submitSurvey],
  );

  const currentValue = form.watch("referralSource");
  const isSubmittingSurvey = form.formState.isSubmitting;
  const isBusy = isCompletingOnboarding || isSubmittingSurvey;

  const isEmpty = (v: unknown) =>
    v == null || (typeof v === "string" && v.trim() === "");
  const currentEmpty = isEmpty(currentValue);
  const showSkip = currentEmpty;

  if (isCompletingOnboarding) {
    return (
      <OnboardingMessage
        showSpinner
        title="Setting up your project"
        description="Taking you to tracing..."
      />
    );
  }

  if (isStatusError) {
    return (
      <OnboardingMessage
        title="Failed to load onboarding"
        description="Refresh the page to try again."
      />
    );
  }

  return (
    <OnboardingCard>
      <Form {...form}>
        <form
          className="flex h-full flex-col"
          onSubmit={form.handleSubmit(onSubmit)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && currentEmpty) {
              event.preventDefault();
              submitSurvey(form.getValues());
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
                  submitSurvey(form.getValues());
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
    </OnboardingCard>
  );
}
