import { useCallback, useEffect } from "react";
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

  const handleSkip = () => {
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
              <Button
                type="button"
                onClick={handleSkip}
                variant={isLastStep ? "default" : "ghost"}
                className="w-20"
              >
                {isLastStep ? "Finish" : "Skip"}
              </Button>

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
