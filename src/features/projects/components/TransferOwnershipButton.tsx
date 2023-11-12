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
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { usePostHog } from "posthog-js/react";
import { useRouter } from "next/router";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  email: z.string().email(),
});
export function TransferOwnershipButton(props: { projectId: string }) {
  const utils = api.useContext();
  const router = useRouter();
  const posthog = usePostHog();

  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "project:transfer",
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  const transferProject = api.projects.transfer.useMutation({
    onSuccess: () => utils.projects.invalidate(),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    transferProject
      .mutateAsync({
        projectId: props.projectId,
        email: values.email,
      })
      .then(() => {
        posthog.capture("project_settings:project_transfer");
        void router.push("/");
      })
      .catch(() => {
        form.setError("email", {
          type: "manual",
          message: "User does not exist or already has access to this project",
        });
      });
  };

  if (!hasAccess) return null;

  return (
    <div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="destructive">Transfer project</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold  ">
              Transfer project
            </DialogTitle>
            <DialogDescription>
              Remember, you can lose ownership, and you will no longer have access to this project
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-8"
              data-testid="new-project-form"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="email"
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
      </Dialog >
    </div>
  )
}
