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
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const formSchema = z.object({
  newOwnerEmail: z.string().email(),
});
export function TransferOwnershipButton(props: { projectId: string }) {
  const utils = api.useUtils();
  const router = useRouter();
  const capture = usePostHogClientCapture();

  const session = useSession();
  const project = session.data?.user?.projects.find(
    (project) => project.id == props.projectId,
  );
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "project:transfer",
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newOwnerEmail: "",
    },
  });

  const transferProject = api.projects.transfer.useMutation({
    onSuccess: () => utils.projects.invalidate(),
    onError: (error) =>
      form.setError("newOwnerEmail", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    form.clearErrors();
    transferProject
      .mutateAsync({
        projectId: props.projectId,
        newOwnerEmail: values.newOwnerEmail,
      })
      .then(() => {
        capture("project_settings:project_transfer");
        void router.push("/");
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="destructive" disabled={!hasAccess}>
            Transfer Ownership
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Transfer project{project?.name ? ` (${project.name})` : ""}
            </DialogTitle>
            <DialogDescription>
              You will lose ownership of this project and will become an admin.
              You cannot undo this action.
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
                name="newOwnerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New owner</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="user@example.com"
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
                loading={transferProject.isLoading}
                className="w-full"
              >
                Transfer project
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
