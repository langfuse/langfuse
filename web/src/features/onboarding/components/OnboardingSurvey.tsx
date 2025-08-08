import { useCallback, useEffect } from "react";
import type { Path } from "react-hook-form";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import { Form } from "@/src/components/ui/form";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { useSurveyForm } from "../hooks/useSurveyForm";
import { SurveyProgress } from "./SurveyProgress";
import { SurveyStep } from "./SurveyStep";
import type { SurveyFormData } from "../lib/surveyTypes";

export function OnboardingSurvey() {
  const router = useRouter();
  const {
    form,
    state,
    currentQuestion,
    isLastStep,
    isFirstStep,
    goNext,
    goBack,
    handleAutoAdvance,
    handleSubmit,
    totalSteps,
  } = useSurveyForm();

  const onSubmit = useCallback(
    async (data: SurveyFormData) => {
      await handleSubmit(data);
      void router.push("/");
    },
    [handleSubmit, router],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) on referralSource step submits the form
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        if (currentQuestion?.id === "referralSource") {
          event.preventDefault();
          form.handleSubmit(onSubmit)();
          return;
        }
      }

      // Regular Enter advances to next step (existing behavior)
      if (event.key === "Enter" && !isLastStep) {
        if (currentQuestion?.type !== "text") {
          goNext();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isLastStep,
    currentQuestion?.type,
    currentQuestion?.id,
    goNext,
    form,
    onSubmit,
  ]);

  // Auto-focus the first form control of the current step
  useEffect(() => {
    if (!currentQuestion?.id) return;
    const field = currentQuestion.id as Path<SurveyFormData>;
    const raf = requestAnimationFrame(() => {
      try {
        form.setFocus(field, { shouldSelect: true });
      } catch {
        // ignore if the control cannot be focused
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [currentQuestion?.id, form]);

  // Determine labeling/behavior of the primary (right) button
  const roleValue = form.watch("role");
  const signupReasonValue = form.watch("signupReason");
  const referralSourceValue = form.watch("referralSource");

  const currentFieldId = currentQuestion?.id as
    | keyof SurveyFormData
    | undefined;
  const currentValue = currentFieldId
    ? form.watch(currentFieldId as Path<SurveyFormData>)
    : undefined;

  const isEmpty = (v: unknown) =>
    v == null || (typeof v === "string" && v.trim() === "");
  const allFields = {
    role: roleValue,
    signupReason: signupReasonValue,
    referralSource: referralSourceValue,
  } as const;

  const currentEmpty = isEmpty(currentValue);
  const otherTwoEmpty = Object.entries(allFields)
    .filter(([key]) => key !== currentFieldId)
    .every(([, v]) => isEmpty(v));
  // showSkip: ghost button labeled "Skip" when skipping is the intended action
  const showSkip = isLastStep ? currentEmpty && otherTwoEmpty : currentEmpty;

  const handleSkipButton = () => {
    if (isLastStep) {
      void router.push("/");
    } else {
      goNext();
    }
  };

  const handleSubmitButton = () => {
    if (isLastStep) {
      form.handleSubmit(onSubmit)();
    } else {
      goNext();
    }
  };

  return (
    <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-start sm:px-6 sm:py-12 lg:px-8">
      <div className="flex items-center justify-center gap-2 sm:mx-auto sm:w-full sm:max-w-md">
        <LangfuseIcon className="h-8 w-8" />
      </div>

      <div className="mt-6 rounded-lg bg-background px-6 py-6 shadow sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[480px] sm:px-12 sm:py-10">
        <Form {...form}>
          <form
            className="flex h-full flex-col"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="flex-1">
              {currentQuestion && (
                <SurveyStep
                  question={currentQuestion}
                  control={form.control}
                  onAutoAdvance={handleAutoAdvance}
                  isLast={isLastStep}
                />
              )}
            </div>

            <div className="flex flex-row-reverse items-center justify-between pt-6">
              {showSkip ? (
                <Button
                  type="button"
                  onClick={handleSkipButton}
                  variant="ghost"
                  className="w-20"
                >
                  Skip
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmitButton}
                  variant="default"
                  className="w-20"
                >
                  {isLastStep ? "Finish" : "Next"}
                </Button>
              )}

              <div className="basis-[10rem] px-4">
                <SurveyProgress
                  currentStep={state.currentStep}
                  totalSteps={totalSteps}
                />
              </div>

              {!isFirstStep ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={goBack}
                  className="w-20"
                >
                  Back
                </Button>
              ) : (
                <div className="w-20" />
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
