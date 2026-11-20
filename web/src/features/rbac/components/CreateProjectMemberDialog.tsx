import { zodResolver } from "@hookform/resolvers/zod";
import { type Role } from "@langfuse/shared";
import { useId, type ComponentProps } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";
import { placeMemberInviteError } from "@/src/features/rbac/fns/placeMemberInviteError";
import { reportTrpcErrorWithoutToast } from "@/src/utils/api";

const roleValues = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
  VIEWER: "VIEWER",
  AI_GATEWAY: "AI_GATEWAY",
  NONE: "NONE",
} as const satisfies Record<Role, Role>;

const formSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  orgRole: z.enum(roleValues),
  projectRole: z.enum(roleValues).exclude([roleValues.AI_GATEWAY]),
});

type FormValues = z.infer<typeof formSchema>;

function MemberRoleSelect(props: ComponentProps<typeof RoleSelect>) {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <RoleSelect
      {...props}
      triggerId={formItemId}
      aria-invalid={Boolean(error)}
      aria-describedby={
        error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId
      }
    />
  );
}

type CreateProjectMemberDialogProps = {
  project: { id: string; name: string } | undefined;
  hasOnlySingleProjectAccess: boolean;
  hasProjectRoleEntitlement: boolean;
  canManageOrgOwnership: boolean;
  canManageProjectOwnership: boolean;
  isAiGatewayEnabled: boolean;
  isPending: boolean;
  createProjectMember: (values: FormValues) => Promise<void>;
  onSuccess: () => void;
};

export function CreateProjectMemberDialog({
  project,
  hasOnlySingleProjectAccess,
  hasProjectRoleEntitlement,
  canManageOrgOwnership,
  canManageProjectOwnership,
  isAiGatewayEnabled,
  isPending,
  createProjectMember,
  onSuccess,
}: CreateProjectMemberDialogProps) {
  const formId = useId();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      orgRole: hasOnlySingleProjectAccess ? roleValues.NONE : roleValues.MEMBER,
      projectRole: hasOnlySingleProjectAccess
        ? roleValues.MEMBER
        : roleValues.NONE,
    },
  });

  async function onSubmit(values: FormValues) {
    form.clearErrors();
    try {
      await createProjectMember(values);
      form.reset();
      onSuccess();
    } catch (error) {
      const placed = placeMemberInviteError(error);
      form.setError(placed.field, {
        type: "manual",
        message: placed.message,
      });
      reportTrpcErrorWithoutToast(error, "members");
    }
  }

  const formError = form.formState.errors.root?.message;

  return (
    <Dialog
      actions={[
        {
          label: "Grant access",
          type: "submit",
          form: formId,
          loading: isPending,
        },
      ]}
      title={`Add new member to the ${
        hasOnlySingleProjectAccess ? "project" : "organization"
      }`}
    >
      <Form {...form}>
        <form
          id={formId}
          className="space-y-6"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <Dialog.Body>
            {formError ? (
              <Alert variant="destructive" size="sm">
                <Alert.Description>{formError}</Alert.Description>
              </Alert>
            ) : null}
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
                    <MemberRoleSelect
                      roles={Object.values(roleValues).filter(
                        (role) =>
                          isAiGatewayEnabled || role !== roleValues.AI_GATEWAY,
                      )}
                      canManageOwnership={canManageOrgOwnership}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
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
                    <MemberRoleSelect
                      isProjectRole
                      canManageOwnership={canManageProjectOwnership}
                      roles={Object.values(roleValues).filter(
                        (role) =>
                          role !== roleValues.AI_GATEWAY &&
                          (!hasOnlySingleProjectAccess ||
                            role !== roleValues.NONE),
                      )}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                    {!hasOnlySingleProjectAccess && (
                      <FormDescription>
                        This project role will override the default role for
                        this current project ({project.name}).
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </Dialog.Body>
        </form>
      </Form>
    </Dialog>
  );
}
