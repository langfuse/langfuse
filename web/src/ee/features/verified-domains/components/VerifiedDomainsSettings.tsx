import { useId, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import Header from "@/src/components/layouts/header";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { ConnectedVerifiedDomainsSettingsTable } from "./VerifiedDomainsSettingsTable/ConnectedVerifiedDomainsSettingsTable";

const addDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(3)
    .max(253)
    .transform((v) => v.toLowerCase())
    .refine(
      (v) =>
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(
          v,
        ),
      { message: "Must be a valid domain (e.g. acme.com)" },
    ),
});

type AddDomainInput = z.infer<typeof addDomainSchema>;

export const VerifiedDomainsSettings = ({ orgId }: { orgId: string }) => {
  const hasEntitlement = useHasEntitlement("cloud-multi-tenant-sso");
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organization:update",
  });

  const heading = (
    <>
      <Header title="Verified Domains" />
      <p className="text-muted-foreground mb-4 text-sm">
        You can only configure SSO for domains your organization owns. Verify a
        domain via DNS to enable SSO for it.
      </p>
    </>
  );

  if (!hasEntitlement) {
    return (
      <div>
        {heading}
        <Banner title="Not available">
          Verified Domains and Enterprise SSO are not available on your plan.
          Please upgrade to access this feature.
        </Banner>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div>
        {heading}
        <Banner title="Access denied">
          You do not have permission to manage verified domains for this
          organization.
        </Banner>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title="Verified Domains"
        actionButtons={
          <AddDomainDialogController orgId={orgId}>
            {({ openDialog }) => (
              <Button
                type="button"
                size="sm"
                onClick={openDialog}
                text="Add Domain"
              />
            )}
          </AddDomainDialogController>
        }
      />
      <p className="text-muted-foreground text-sm">
        You can only configure SSO for domains your organization owns. Verify a
        domain via DNS to enable SSO for it.
      </p>
      <ConnectedVerifiedDomainsSettingsTable orgId={orgId} />
    </div>
  );
};

function AddDomainDialogController({
  orgId,
  children,
}: {
  orgId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const utils = api.useUtils();

  const createMutation = api.verifiedDomain.create.useMutation({
    onSuccess: () => {
      utils.verifiedDomain.list.invalidate({ orgId });
      showSuccessToast({
        operation: "verified_domain.add",
        title: "Domain added",
        description:
          "Click Verify to view the DNS TXT record, then confirm after adding it.",
      });
    },
  });

  return (
    <DialogController<true>
      onBeforeClose={() => !createMutation.isPending}
      renderDialog={({ closeDialog }) => (
        <AddDomainDialogContent
          createMutation={createMutation}
          orgId={orgId}
          onSuccess={() => {
            createMutation.reset();
            closeDialog();
          }}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openDialog: () => openDialog(true),
        })
      }
    </DialogController>
  );
}

function AddDomainDialogContent({
  orgId,
  createMutation,
  onSuccess,
}: {
  orgId: string;
  createMutation: {
    isPending: boolean;
    mutateAsync: (input: { orgId: string; domain: string }) => Promise<unknown>;
    reset: () => void;
  };
  onSuccess: () => void;
}) {
  const formId = useId();

  const form = useForm<AddDomainInput>({
    resolver: zodResolver(addDomainSchema),
    defaultValues: { domain: "" },
  });

  async function onSubmit(values: AddDomainInput) {
    try {
      await createMutation.mutateAsync({ orgId, domain: values.domain });
      form.reset();
      onSuccess();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add domain";
      form.setError("domain", { message });
    }
  }

  return (
    <Dialog
      title="Add a domain"
      actions={[
        {
          label: "Add",
          loading: createMutation.isPending,
          type: "submit",
          form: formId,
        },
      ]}
    >
      <Dialog.Body>
        <Form {...form}>
          <form
            id={formId}
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Domain</FormLabel>
                  <FormControl>
                    <Input placeholder="acme.com" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
