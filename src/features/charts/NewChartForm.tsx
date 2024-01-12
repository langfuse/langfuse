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
import { zodResolver } from "@hookform/resolvers/zod";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
  name: z.string(),
  // TODO: add chart fields
});

export const NewChartForm = (props: {
  projectId: string;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  // const utils = api.useUtils();

  // mutation

  function onSubmit(/*values: z.infer<typeof formSchema>*/) {
    posthog.capture("charts:new_chart_form_submit");
    // Mutation
    // .mutateAsync({
    //   ...values,
    //   projectId: props.projectId,
    // })
    // .then(() => {
    //   props.onFormSuccess?.();
    //   form.reset();
    // })
    // .catch((error) => {
    //   console.error(error);
    // });
  }

  return (
    <div>
      <Form {...form}>
        <form
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            // loading={mutation.isLoading}
            className="w-full"
          >
            Create chart
          </Button>
        </form>
      </Form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </div>
  );
};
