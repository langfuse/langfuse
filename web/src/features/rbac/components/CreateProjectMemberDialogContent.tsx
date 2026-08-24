import { zodResolver } from "@hookform/resolvers/zod";
import { Role } from "@langfuse/shared";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/src/components/ui/button";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import { reportTrpcErrorWithoutToast } from "@/src/utils/api";

const formSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  orgRole: z.enum(Role),
  projectRole: z.enum(Role),
});

type FormValues = z.infer<typeof formSchema>;

type CreateProjectMemberDialogContentProps = {
  project: { id: string; name: string } | undefined;
  hasOnlySingleProjectAccess: boolean;
  hasProjectRoleEntitlement: boolean;
  isSubmitting: boolean;
  createProjectMember: (values: FormValues) => Promise<void>;
  onSuccess: () => void;
};

export function CreateProjectMemberDialogContent({
  project,
  hasOnlySingleProjectAccess,
  hasProjectRoleEntitlement,
  isSubmitting,
  createProjectMember,
  onSuccess,
}: CreateProjectMemberDialogContentProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      orgRole: hasOnlySingleProjectAccess ? Role.NONE : Role.MEMBER,
      projectRole: hasOnlySingleProjectAccess ? Role.MEMBER : Role.NONE,
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createProjectMember(values);
      form.reset();
      onSuccess();
    } catch (error) {
      form.setError("email", {
        type: "manual",
        message:
          error instanceof Error ? error.message : "Failed to add member",
      });
      reportTrpcErrorWithoutToast(error, "members");
    }
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <DialogBody>
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
          {!hasOnlySingleProjectAccess && (
            <FormField
              control={form.control}
              name="orgRole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Role</FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={(value) =>
                      field.onChange(value as (typeof Role)[keyof typeof Role])
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an organization role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(Role).map((role) => (
                        <RoleSelectItem role={role} key={role} />
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {project !== undefined && hasProjectRoleEntitlement && (
            <FormField
              control={form.control}
              name="projectRole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Role</FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={(value) =>
                      field.onChange(value as (typeof Role)[keyof typeof Role])
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a project role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(Role)
                        .filter(
                          (role) =>
                            !hasOnlySingleProjectAccess || role !== Role.NONE,
                        )
                        .map((role) => (
                          <RoleSelectItem
                            role={role}
                            key={role}
                            isProjectRole
                          />
                        ))}
                    </SelectContent>
                  </Select>
                  {!hasOnlySingleProjectAccess && (
                    <FormDescription>
                      This project role will override the default role for this
                      current project ({project.name}).
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Grant access
          </Button>
          <FormMessage />
        </DialogFooter>
      </form>
    </Form>
  );
}
