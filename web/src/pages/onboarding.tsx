// This page is currently only shown to Langfuse cloud users.
// It might be expanded to everyone in the future when it does not only ask for the referral source.

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { usePostHog } from "posthog-js/react";
import { useRouter } from "next/router";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { Textarea } from "@/src/components/ui/textarea";

const referralSourceSchema = z.object({
  referralSource: z.string().optional(),
});

export default function ReferralSource() {
  const posthog = usePostHog();
  const router = useRouter();
  const form = useForm<z.infer<typeof referralSourceSchema>>({
    resolver: zodResolver(referralSourceSchema),
    defaultValues: {
      referralSource: "",
    },
  });

  function onSubmit(values: z.infer<typeof referralSourceSchema>) {
    if (values.referralSource && values.referralSource !== "") {
      posthog.capture("survey sent", {
        $survey_id: "018ade05-4d8c-0000-36b7-fc390b221590",
        $survey_name: "Referral source",
        $survey_response: values.referralSource,
      });
    }
    void router.push("/?getStarted=1");
  }

  return (
    <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <LangfuseIcon className="mx-auto" />
        <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-primary">
          Welcome to Langfuse
        </h2>
      </div>
      <div className="mt-14 bg-background px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-12">
        <Form {...form}>
          <form
            className="space-y-6"
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="referralSource"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Where did you hear about us?{" "}
                    <span className="font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="We're curious to know how you discovered the project! Thanks for sharing."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              variant={form.formState.isDirty ? "default" : "secondary"}
              className="w-full"
              loading={form.formState.isSubmitting}
            >
              {form.formState.isDirty ? "Continue" : "Skip"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
