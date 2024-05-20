import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
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
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { chatRunTrigger } from "@/src/features/support-chat/chat";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

interface NewProjectButtonProps {
  orgId: string;
  inBreadcrumb?: boolean;
}
export function NewProjectButton({
  orgId,
  inBreadcrumb,
}: NewProjectButtonProps) {
  const [open, setOpen] = useState(false);
  const { update: updateSession } = useSession();

  const form = useForm<z.infer<typeof projectNameSchema>>({
    resolver: zodResolver(projectNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const utils = api.useUtils();
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const createProjectMutation = api.projects.create.useMutation({
    onSuccess: (newProject) => {
      void updateSession();
      void router.push(`/project/${newProject.id}/settings`);
      void utils.projects.invalidate();
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
      .then(() => {
        setOpen(false);
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
    chatRunTrigger("after-project-creation");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (open) {
          capture("projects:new_form_open");
        }
        setOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={inBreadcrumb ? "ghost" : undefined}
          size={inBreadcrumb ? "xs" : undefined}
          data-testid="create-project-btn"
          className={
            inBreadcrumb ? "h-8 w-full text-sm font-normal" : undefined
          }
        >
          <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="mb-5">New project</DialogTitle>
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
            <Button
              type="submit"
              loading={createProjectMutation.isLoading}
              className="w-full"
            >
              Create
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
