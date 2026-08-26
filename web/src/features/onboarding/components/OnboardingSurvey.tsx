import { useForm } from "react-hook-form";
import { ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import type { SurveyFormData } from "../lib/surveyTypes";

type OnboardingSurveyProps =
  | { state: "completing" }
  | { state: "error" }
  | {
      state: "form";
      canConfigureAiFeatures: boolean;
      onSubmit: (data: SurveyFormData) => Promise<void>;
    };

export function OnboardingSurvey(props: OnboardingSurveyProps) {
  const form = useForm<SurveyFormData>({
    defaultValues: {
      referralSource: undefined,
      aiFeaturesEnabled: true,
    },
  });

  const completingContent = (
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

  if (props.state === "completing") {
    return completingContent;
  }

  if (props.state === "error") {
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

  if (form.formState.isSubmitting) {
    return completingContent;
  }

  const submitForm = form.handleSubmit(async (data) => props.onSubmit(data));

  return (
    <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-start sm:px-6 sm:py-12 lg:px-8">
      <div className="flex items-center justify-center gap-2 sm:mx-auto sm:w-full sm:max-w-md">
        <LangfuseIcon size={32} />
      </div>

      <div className="bg-background mt-6 rounded-lg px-6 py-6 shadow-sm sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[480px] sm:px-12 sm:py-10">
        <Form {...form}>
          <form className="flex h-full flex-col" onSubmit={submitForm}>
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
              {props.canConfigureAiFeatures && (
                <div className="mt-6 border-t pt-6">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-bold">
                      Organizational settings
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      This setting applies to all users in your organization.
                      You can change it later in organization settings.
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="aiFeaturesEnabled"
                    render={({ field }) => (
                      <FormItem className="mt-3 flex flex-row items-start justify-between gap-4 rounded-md border p-3">
                        <div className="flex flex-col gap-1">
                          <FormLabel>Enable AI powered features</FormLabel>
                          <p className="text-muted-foreground text-sm">
                            Relevant project data can be sent to AWS Bedrock
                            within your Langfuse data region. Your data will not
                            be used for training models.{" "}
                            <a
                              href="https://langfuse.com/security/ai-features"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary inline-flex items-center gap-1 hover:underline"
                            >
                              Learn more
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            aria-label="Enable AI powered features"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end pt-6">
              <Button type="submit" variant="default" className="w-20">
                Next
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
