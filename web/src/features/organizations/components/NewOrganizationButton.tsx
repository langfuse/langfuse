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
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";

import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

interface NewProjectButtonProps {
  inBreadcrumb?: boolean;
}
export function NewOrganizationButton({ inBreadcrumb }: NewProjectButtonProps) {
  const [open, setOpen] = useState(false);
  const { update: updateSession } = useSession();

  const form = useForm<z.infer<typeof organizationNameSchema>>({
    resolver: zodResolver(organizationNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const utils = api.useUtils();
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const createOrgMutation = api.organizations.create.useMutation({
    onSuccess: (newOrg) => {
      void updateSession();
      void router.push(`/organization/${newOrg.id}`);
      void utils.projects.invalidate();
    },
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof organizationNameSchema>) {
    capture("organizations:new_form_submit");
    createOrgMutation
      .mutateAsync({
        name: values.name,
      })
      .then(() => {
        setOpen(false);
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (open) {
          capture("organizations:new_form_open");
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
          New Organization
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="mb-5">New Organization</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8"
            data-testid="new-org-form"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="my-org"
                      {...field}
                      data-testid="new-org-name-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              loading={createOrgMutation.isLoading}
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
