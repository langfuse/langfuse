import { Button } from "@/src/app/design-system/legacy-primitives/button";
import type * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/app/design-system/legacy-primitives/form";
import { Input } from "@/src/app/design-system/legacy-primitives/input";
import { api, reportTrpcErrorWithoutToast } from "@/src/app/utils/api";
import { useSession } from "next-auth/react";
import { projectNameSchema } from "@/src/identity/auth";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";

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
  const createProjectMutation = api.projects.create.useMutation({
    onSuccess: () => {
      updateSession();
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
      .catch((error) => reportTrpcErrorWithoutToast(error, "projects"));
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
            form.handleSubmit(onSubmit)();
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
        <Button type="submit" loading={createProjectMutation.isPending}>
          Create
        </Button>
      </form>
    </Form>
  );
};
