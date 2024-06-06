import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import type * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export default function RenameProject(props: { projectId: string }) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "project:update",
  });
  const { data: getSessionData, update: updateSession } = useSession();
  const projectName = getSessionData?.user?.projects.find(
    (p) => p.id === props.projectId,
  )?.name;

  const form = useForm<z.infer<typeof projectNameSchema>>({
    resolver: zodResolver(projectNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const renameProject = api.projects.update.useMutation({
    onSuccess: (_) => {
      void updateSession();
      void utils.projects.invalidate();
    },
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof projectNameSchema>) {
    capture("project_settings:rename_form_submit");
    renameProject
      .mutateAsync({
        projectId: props.projectId,
        newName: values.name,
      })
      .then(() => {
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  if (!hasAccess) return null;

  return (
    <div>
      <Header title="Project Name" level="h3" />
      <Card className="mb-4 p-4">
        {form.getValues().name !== "" ? (
          <p className="mb-4 text-sm text-primary">
            Your Project will be renamed to &quot;
            <b>{form.watch().name}</b>&quot;.
          </p>
        ) : (
          <p className="mb-4 text-sm text-primary" data-testid="project-name">
            Your Project is currently named &quot;<b>{projectName}</b>
            &quot;.
          </p>
        )}
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1"
            data-testid="rename-project-form"
            id="rename-project-form"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder={projectName}
                      {...field}
                      className="flex-1"
                      data-testid="new-project-name-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              variant="secondary"
              type="submit"
              loading={renameProject.isLoading}
              disabled={form.getValues().name === ""}
              className="mt-4"
            >
              Save
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}
