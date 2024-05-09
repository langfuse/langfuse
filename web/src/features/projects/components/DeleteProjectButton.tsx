import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function DeleteProjectButton(props: { projectId: string }) {
  const session = useSession();
  const capture = usePostHogClientCapture();

  //code for dynamic confirmation message
  const userInfo = session.data?.user;
  const currentProject = userInfo?.projects.find(
    (project) => project.id == props.projectId,
  );
  const confirmMessage =
    userInfo?.name?.replace(" ", "-") +
    "/" +
    currentProject?.name.replace(" ", "-");

  const formSchema = z.object({
    name: z.string().includes(confirmMessage, {
      message: `Please confirm with "${confirmMessage}"`,
    }),
  });

  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "project:delete",
  });

  const deleteProject = api.projects.delete.useMutation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  // delete project functionality
  const onSubmit = () => {
    capture("project_settings:project_delete");
    deleteProject
      .mutateAsync({
        projectId: props.projectId,
      })
      .then(() => {
        window.location.href = "/"; // browser reload to refresh jwt
      })
      .catch((error) => {
        console.error(error);
      });
  };

  return (
    <div>
      <Header title="Danger Zone" level="h3" />
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="destructive" disabled={!hasAccess}>
            Delete Project
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold  ">
              Delete Project
            </DialogTitle>
            <DialogDescription className=" ">
              {`To confirm, type "${confirmMessage}" in the input box `}
            </DialogDescription>
          </DialogHeader>
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
                    <FormControl>
                      <Input
                        placeholder={confirmMessage}
                        {...field}
                        data-testid="new-project-name-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                variant="destructive"
                loading={deleteProject.isLoading}
                className="w-full"
              >
                Delete project
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
