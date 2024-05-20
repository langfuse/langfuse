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
import { OrganizationRole, ProjectRole } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

const formSchema = z.object({
  email: z.string().trim().email(),
  orgRole: z.nativeEnum(OrganizationRole),
  defaultProjectRole: z.nativeEnum(ProjectRole),
  projectRole: z.union([
    z.nativeEnum(ProjectRole),
    // Allow for the project role to be set to NONE
    z.literal("NONE"),
  ]),
});

export function CreateProjectMemberButton(props: {
  orgId: string;
  projectId?: string;
}) {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasOrganizationAccess({
    organizationId: props.orgId,
    scope: "members:CUD",
  });

  const utils = api.useUtils();
  const mutCreateProjectMember = api.members.create.useMutation({
    onSuccess: () => utils.members.invalidate(),
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
      orgRole: OrganizationRole.MEMBER,
      defaultProjectRole: ProjectRole.MEMBER,
      projectRole: "NONE",
    },
  });

  if (!hasAccess) return null;

  function onSubmit(values: z.infer<typeof formSchema>) {
    capture(
      props.projectId
        ? "project_settings:send_membership_invitation"
        : "organization_settings:send_membership_invitation",
      {
        orgRole: values.orgRole,
        defaultProjectRole: values.defaultProjectRole,
        projectRole: values.projectRole,
      },
    );
    return mutCreateProjectMember
      .mutateAsync({
        orgId: props.orgId,
        email: values.email,
        orgRole: values.orgRole,
        defaultProjectRole: values.defaultProjectRole,
        //optional
        projectId: props.projectId,
        projectRole:
          values.projectRole === "NONE" ? undefined : values.projectRole,
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
            <DialogTitle>Add new member to the organization</DialogTitle>
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
                name="orgRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Role</FormLabel>
                    <Select
                      defaultValue={field.value}
                      onValueChange={(value) =>
                        field.onChange(
                          value as (typeof OrganizationRole)[keyof typeof OrganizationRole],
                        )
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an organization role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(OrganizationRole).map((role) => (
                          <SelectItem value={role} key={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultProjectRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Project Role</FormLabel>
                    <Select
                      defaultValue={field.value}
                      onValueChange={(value) =>
                        field.onChange(
                          value as (typeof ProjectRole)[keyof typeof ProjectRole],
                        )
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a default project role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(ProjectRole).map((role) => (
                          <SelectItem value={role} key={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The default role for this user in all projects within this
                      organization.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {props.projectId && (
                <FormField
                  control={form.control}
                  name="projectRole"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Role</FormLabel>
                      <Select
                        defaultValue={field.value}
                        onValueChange={(value) =>
                          field.onChange(
                            value as (typeof ProjectRole)[keyof typeof ProjectRole],
                          )
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a project role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(ProjectRole).map((role) => (
                            <SelectItem value={role} key={role}>
                              {role}
                            </SelectItem>
                          ))}
                          <SelectItem value="NONE" key="NONE">
                            None (keep default role)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        This project role will override the default role for
                        this current project.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
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
