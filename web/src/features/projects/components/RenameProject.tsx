import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
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
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { LockIcon } from "lucide-react";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useSession } from "next-auth/react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useTranslations } from "next-intl";

export default function RenameProject() {
  const t = useTranslations("settingsEnterprise.generalSettings");
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
      <Header title={t("projectName.title")} />
      <Card className="mb-4 p-3">
        {form.getValues().name !== "" ? (
          <p className="text-primary mb-4 text-sm">
            {t.rich("projectName.renamed", {
              currentName: project?.name ?? "",
              newName: form.watch().name,
              strong: (chunks) => <b>{chunks}</b>,
            })}
          </p>
        ) : (
          <p className="text-primary mb-4 text-sm">
            {t.rich("projectName.current", {
              name: project?.name ?? "",
              strong: (chunks) => <b>{chunks}</b>,
            })}
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
                        <span title={t("common.noAccess")}>
                          <LockIcon className="text-muted absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 transform" />
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
                {t("common.save")}
              </Button>
            )}
          </form>
        </Form>
      </Card>
    </div>
  );
}
