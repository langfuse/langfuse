import { Card } from "@tremor/react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import * as z from "zod";
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

const formSchema = z.object({
  newName: z.string().min(3, "Must have at least 3 characters"),
});

export default function RenameProject(props: { projectId: string }) {
  const utils = api.useUtils();
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "project:update",
  });
  const { data: getSessionData, update: updateSession } = useSession();
  const projectName = getSessionData?.user?.projects.find(
    (p) => p.id === props.projectId,
  )?.name;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newName: "",
    },
  });
  const renameProject = api.projects.update.useMutation({
    onSuccess: (_) => {
      void updateSession();
      void utils.projects.invalidate();
    },
    onError: (error) => form.setError("newName", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    renameProject
      .mutateAsync({ projectId: props.projectId, newName: values.newName })
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
      <h2 className="mb-5 text-base font-semibold leading-6 text-gray-900">
        Project Name
      </h2>
      <Card className="mb-4 p-4">
        {form.getValues().newName !== "" ? (
          <p className="mb-4 text-sm text-gray-700">
            Your Project will be renamed to &quot;
            <b>{form.watch().newName}</b>&quot;.
          </p>
        ) : (
          <p className="mb-4 text-sm text-gray-700">
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
              name="newName"
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
              disabled={form.getValues().newName === ""}
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
