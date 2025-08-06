import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import * as z from "zod/v4";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { env } from "@/src/env.mjs";

export function DeleteProjectButton() {
  const capture = usePostHogClientCapture();

  //code for dynamic confirmation message
  const { project, organization } = useQueryProject();
  const confirmMessage = (organization?.name + "/" + project?.name)
    .replaceAll(" ", "-")
    .toLowerCase();

  const formSchema = z.object({
    name: z.string().includes(confirmMessage, {
      message: `Please confirm with "${confirmMessage}"`,
    }),
  });

  const hasAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "project:delete",
  });

  const deleteProject = api.projects.delete.useMutation();

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  // delete project functionality
  const onSubmit = () => {
    if (!project) return;
    capture("project_settings:project_delete");
    deleteProject
      .mutateAsync({
        projectId: project.id,
      })
      .then(() => {
        window.location.href = env.NEXT_PUBLIC_BASE_PATH ?? "/"; // browser reload to refresh jwt
      })
      .catch((error) => {
        console.error(error);
      });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive-secondary" disabled={!hasAccess}>
          プロジェクトを削除
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            プロジェクトを削除
          </DialogTitle>
          <DialogDescription className=" ">
            {`確認のため、入力ボックスに「${confirmMessage}」と入力してください`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8"
          >
            <DialogBody>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input placeholder={confirmMessage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button
                type="submit"
                variant="destructive"
                loading={deleteProject.isLoading}
                className="w-full"
              >
                プロジェクトを削除
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
