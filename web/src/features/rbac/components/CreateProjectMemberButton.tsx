import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Input } from "@/src/components/ui/input";
import { ProjectRole } from "@langfuse/shared";
import { roleAccessRights } from "@/src/features/rbac/constants/roleAccessRights";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const availableRoles = [
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
  ProjectRole.VIEWER,
] as const;

const formSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(availableRoles),
});

export function CreateProjectMemberButton(props: { projectId: string }) {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "members:create",
  });

  const utils = api.useUtils();
  const mutCreateProjectMember = api.projectMembers.create.useMutation({
    onSuccess: () => utils.projectMembers.invalidate(),
    onError: (error) =>
      form.setError("email", {
        type: "manual",
        message: error.message,
      }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      role: ProjectRole.MEMBER,
    },
  });

  if (!hasAccess) return null;

  function onSubmit(values: z.infer<typeof formSchema>) {
    capture("project_settings:send_membership_invitation", {
      role: values.role,
    });
    return mutCreateProjectMember
      .mutateAsync({
        projectId: props.projectId,
        email: values.email,
        role: values.role,
      })
      .then(() => {
        form.reset();
        setOpen(false);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            loading={mutCreateProjectMember.isLoading}
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Add new member
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new member to project</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              className="space-y-6"
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="jsdoe@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      defaultValue={field.value}
                      onValueChange={(value) =>
                        field.onChange(value as (typeof availableRoles)[number])
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a verified email to display" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableRoles.map((role) => (
                          <SelectItem value={role} key={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Rights of role:{" "}
                      {roleAccessRights[field.value].length
                        ? roleAccessRights[field.value].join(", ")
                        : "none"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                loading={form.formState.isSubmitting}
              >
                Grant access
              </Button>
              <FormMessage />
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
