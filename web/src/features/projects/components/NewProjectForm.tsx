import { Button } from "@/src/components/ui/button";
import type * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const NewProjectForm = ({
  orgId,
  onSuccess,
}: {
  orgId: string;
  onSuccess: (projectId: string) => void;
}) => {
  const capture = usePostHogClientCapture();
  const { update: updateSession } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    resolver: zodResolver(projectNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const createProjectMutation = api.projects.create.useMutation({
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof projectNameSchema>) {
    capture("projects:new_form_submit");
    setIsSubmitting(true);
    createProjectMutation
      .mutateAsync({
        name: values.name,
        orgId,
      })
      .then(async (project) => {
        await updateSession();
        form.reset();
        await onSuccess(project.id);
      })
      .catch((error) => {
        console.error(error);
        setIsSubmitting(false);
      });
  }
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
        data-testid="new-project-form"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void form.handleSubmit(onSubmit)();
          }
        }}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project name</FormLabel>
              <FormControl>
                <Input
                  placeholder="my-llm-project"
                  {...field}
                  data-testid="new-project-name-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={isSubmitting}>
          Create
        </Button>
      </form>
    </Form>
  );
};
