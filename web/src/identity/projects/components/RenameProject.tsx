import { Card } from "@/src/app/design-system/legacy-primitives/card";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { Input } from "@/src/app/design-system/legacy-primitives/input";
import { api, reportTrpcErrorWithoutToast } from "@/src/app/utils/api";
import type * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/app/design-system/legacy-primitives/form";
import { projectNameSchema } from "@/src/identity/auth";
import Header from "@/src/app/shell/layouts/header";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { LockIcon } from "lucide-react";
import { useQueryProject } from "@/src/identity/projects/hooks";
import { useSession } from "next-auth/react";
import { useHasProjectAccess } from "@/src/identity/access-control";

export default function RenameProject() {
  const { update: updateSession } = useSession();
  const utils = api.useUtils();
  const { project } = useQueryProject();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "project:update",
  });

  const form = useForm({
    resolver: zodResolver(projectNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const renameProject = api.projects.update.useMutation({
    onSuccess: (_) => {
      updateSession();
      // Admins resolve org/project context from these queries, not the session
      utils.organizations.byId.invalidate();
      utils.projects.byId.invalidate();
    },
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof projectNameSchema>) {
    if (!hasAccess || !project) return;
    capture("project_settings:rename_form_submit");
    renameProject
      .mutateAsync({
        projectId: project.id,
        newName: values.name,
      })
      .then(() => {
        form.reset();
      })
      .catch((error) => reportTrpcErrorWithoutToast(error, "projects"));
  }

  return (
    <div>
      <Header title="Project Name" />
      <Card className="mb-4 p-3">
        {form.getValues().name !== "" ? (
          <p className="text-primary mb-4 text-sm">
            Your Project will be renamed from &quot;
            {project?.name ?? ""}
            &quot; to &quot;
            <b>{form.watch().name}</b>&quot;.
          </p>
        ) : (
          <p className="text-primary mb-4 text-sm">
            Your Project is currently named &quot;
            <b>{project?.name ?? ""}</b>
            &quot;.
          </p>
        )}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1"
            id="rename-project-form"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder={project?.name ?? ""}
                        {...field}
                        className="flex-1"
                        disabled={!hasAccess}
                      />
                      {!hasAccess && (
                        <span title="No access">
                          <LockIcon className="text-muted icon-base absolute top-1/2 right-3 -translate-y-1/2 transform" />
                        </span>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {hasAccess && (
              <Button
                variant="secondary"
                type="submit"
                loading={renameProject.isPending}
                disabled={form.getValues().name === "" || !hasAccess}
                className="mt-4"
              >
                Save
              </Button>
            )}
          </form>
        </Form>
      </Card>
    </div>
  );
}
