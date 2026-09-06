import { Button } from "@/src/components/ui/button";
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
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import {
  createProjectNameSchema,
  type projectNameSchema,
} from "@/src/features/auth/lib/projectNameSchema";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTranslations } from "next-intl";

export const NewProjectForm = ({
  orgId,
  onSuccess,
}: {
  orgId: string;
  onSuccess: (projectId: string) => void;
}) => {
  const t = useTranslations("workspace");
  const capture = usePostHogClientCapture();
  const { update: updateSession } = useSession();

  const localizedProjectNameSchema = createProjectNameSchema({
    noHtml: t("validation.noHtml"),
    minLength: t("validation.minLength"),
    maxLength: t("validation.maxLength"),
  });
  const form = useForm({
    resolver: zodResolver(localizedProjectNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const createProjectMutation = api.projects.create.useMutation({
    onSuccess: () => {
      updateSession();
    },
    onError: () =>
      form.setError("name", { message: t("projectForm.createFailed") }),
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
              <FormLabel>{t("projectForm.name")}</FormLabel>
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
          {t("projectForm.create")}
        </Button>
      </form>
    </Form>
  );
};
