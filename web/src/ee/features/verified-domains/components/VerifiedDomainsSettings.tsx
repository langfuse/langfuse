/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { showSuccessToast } from "@/src/features/notifications";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { ConnectedVerifiedDomainsSettingsTable } from "./VerifiedDomainsSettingsTable/ConnectedVerifiedDomainsSettingsTable";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
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
import Header from "@/src/components/layouts/header";
import { useHasEntitlement } from "@/src/features/entitlements";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
        <Alert icon={AlertCircle}>
          <Alert.Title>Not available</Alert.Title>
          <Alert.Description>
            Verified Domains and Enterprise SSO are not available on your plan.
            Please upgrade to access this feature.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div>
        {heading}
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to manage verified domains for this
            organization.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title="Verified Domains"
        actionButtons={<AddDomainButton orgId={orgId} />}
      />
      <p className="text-muted-foreground text-sm">
        You can only configure SSO for domains your organization owns. Verify a
        domain via DNS to enable SSO for it.
      </p>
      <ConnectedVerifiedDomainsSettingsTable orgId={orgId} />
    </div>
  );
};

function AddDomainButton({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();

  const form = useForm<AddDomainInput>({
    resolver: zodResolver(addDomainSchema),
    defaultValues: { domain: "" },
  });

  const createMutation = api.verifiedDomain.create.useMutation({
    onSuccess: () => {
      utils.verifiedDomain.list.invalidate({ orgId });
      showSuccessToast({
        title: "Domain added",
        description:
          "Click Verify to view the DNS TXT record, then confirm after adding it.",
      });
      form.reset();
      setOpen(false);
    },
    onError: (err) => {
      form.setError("domain", { message: err.message });
    },
  });

  function onSubmit(values: AddDomainInput) {
    createMutation.mutate({ orgId, domain: values.domain });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add Domain</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a domain</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogBody>
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
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
