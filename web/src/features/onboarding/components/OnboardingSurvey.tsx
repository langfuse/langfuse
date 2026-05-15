import { useCallback } from "react";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import { Form } from "@/src/components/ui/form";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { useSurveyForm } from "../hooks/useSurveyForm";
import { SurveyStep } from "./SurveyStep";
import type { SurveyFormData } from "../lib/surveyTypes";

export function OnboardingSurvey() {
  const router = useRouter();
  const { form, question, handleSubmit } = useSurveyForm();

  const onSubmit = useCallback(
    async (data: SurveyFormData) => {
      if (!data.referralSource?.trim()) {
        void router.push("/");
        return;
      }

      await handleSubmit(data);
      void router.push("/");
    },
    [handleSubmit, router],
  );

  const currentValue = form.watch("referralSource");

  const isEmpty = (v: unknown) =>
    v == null || (typeof v === "string" && v.trim() === "");
  const currentEmpty = isEmpty(currentValue);
  const showSkip = currentEmpty;

  const handleSkipButton = () => {
    void router.push("/");
  };

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
                void router.push("/");
              }
            }}
          >
            <div className="flex-1">
              <SurveyStep question={question} control={form.control} />
            </div>

            <div className="flex justify-end pt-6">
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
                <Button type="submit" variant="default" className="w-20">
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
