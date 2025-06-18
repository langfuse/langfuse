import { Button } from "@/src/components/ui/button";
import type * as z from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showChat } from "@/src/features/support-chat/PlainChat";

export const NewProjectForm = ({
  orgId,
  onSuccess,
}: {
  orgId: string;
  onSuccess: (projectId: string) => void;
}) => {
  const capture = usePostHogClientCapture();
  const { update: updateSession } = useSession();

  const form = useForm({
    resolver: zodResolver(projectNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const router = useRouter();
  const createProjectMutation = api.projects.create.useMutation({
    onSuccess: (newProject) => {
      void updateSession();
      void router.push(`/project/${newProject.id}/settings`);
    },
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof projectNameSchema>) {
    capture("projects:new_form_submit");
    createProjectMutation
      .mutateAsync({
        name: values.name,
        orgId,
      })
      .then((project) => {
        onSuccess(project.id);
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
    showChat();
  }
  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
        data-testid="new-project-form"
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
        <Button type="submit" loading={createProjectMutation.isLoading}>
          Create
        </Button>
      </form>
    </Form>
  );
};
