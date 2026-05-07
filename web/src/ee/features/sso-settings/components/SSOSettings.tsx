import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/src/components/ui/alert-dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableCellWithCopyButton,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import Header from "@/src/components/layouts/header";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { VerifiedDomainsSettings } from "@/src/ee/features/verified-domains/components/VerifiedDomainsSettings";
import { SsoProviderSchema } from "@/src/ee/features/multi-tenant-sso/types";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const SSO_PROVIDERS: ReadonlyArray<{
  id: SsoProviderSchema["authProvider"];
  label: string;
  fields: ReadonlyArray<"issuer" | "tenantId" | "baseUrl" | "name">;
}> = [
  { id: "google", label: "Google", fields: [] },
  { id: "github", label: "GitHub", fields: [] },
  { id: "github-enterprise", label: "GitHub Enterprise", fields: ["baseUrl"] },
  { id: "gitlab", label: "GitLab", fields: [] },
  { id: "auth0", label: "Auth0", fields: ["issuer"] },
  { id: "okta", label: "Okta", fields: ["issuer"] },
  { id: "authentik", label: "Authentik", fields: ["issuer"] },
  { id: "onelogin", label: "OneLogin", fields: ["issuer"] },
  { id: "azure-ad", label: "Azure AD / Entra ID", fields: ["tenantId"] },
  { id: "cognito", label: "AWS Cognito", fields: ["issuer"] },
  { id: "keycloak", label: "Keycloak", fields: ["issuer"] },
  { id: "jumpcloud", label: "JumpCloud", fields: ["issuer"] },
  // Custom OIDC requires a display name on the schema; surface it in the form.
  { id: "custom", label: "Custom OIDC", fields: ["name", "issuer"] },
];

const providerLabel = (id: string) =>
  SSO_PROVIDERS.find((p) => p.id === id)?.label ?? id;

// Loose form schema; the strict validation lives in SsoProviderSchema and runs
// at submit time. Keeping the form schema permissive lets users mid-edit a
// field without immediate noise from required-field errors on every render.
const formSchema = z.object({
  authProvider: z.enum(SSO_PROVIDERS.map((p) => p.id) as [string, ...string[]]),
  authConfig: z.object({
    clientId: z.string().min(1, "Required"),
    clientSecret: z.string().min(1, "Required"),
    issuer: z.string().optional(),
    tenantId: z.string().optional(),
    baseUrl: z.string().optional(),
    // Required by CustomProviderSchema; optional in the form so other
    // providers don't carry a stray field. The strict provider schema
    // enforces presence at submit for `custom`.
    name: z.string().optional(),
  }),
});

type FormValues = z.infer<typeof formSchema>;

type SsoConfigRow = {
  domain: string;
  authProvider: string;
  authConfig: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export const SSOSettings = ({ orgId }: { orgId: string }) => {
  const hasEntitlement = useHasEntitlement("cloud-multi-tenant-sso");
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organization:update",
  });

  const heading = (
    <>
      <Header title="SSO Configuration" />
      <p className="text-muted-foreground mb-4 text-sm">
        Configure Single Sign-On per verified domain. Once active, every user
        signing in with that domain is redirected to your identity provider.
      </p>
    </>
  );

  if (!hasEntitlement) {
    return (
      <div className="space-y-8">
        <VerifiedDomainsSettings orgId={orgId} />
        <div>
          {heading}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Not available</AlertTitle>
            <AlertDescription>
              Enterprise SSO is not available on your plan. Please upgrade to
              access this feature.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="space-y-8">
        <VerifiedDomainsSettings orgId={orgId} />
        <div>
          {heading}
          <Alert>
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to configure SSO for this organization.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <VerifiedDomainsSettings orgId={orgId} />
      <div className="space-y-6">
        {heading}
        <SsoConfigsTable orgId={orgId} />
      </div>
    </div>
  );
};

function SsoConfigsTable({ orgId }: { orgId: string }) {
  const verifiedDomainsQuery = api.verifiedDomain.list.useQuery({ orgId });
  const ssoConfigsQuery = api.ssoConfig.get.useQuery({ orgId });

  const verifiedDomains = useMemo(
    () => verifiedDomainsQuery.data?.filter((d) => d.verifiedAt != null) ?? [],
    [verifiedDomainsQuery.data],
  );
  const configByDomain = useMemo(() => {
    const map = new Map<string, SsoConfigRow>();
    ssoConfigsQuery.data?.forEach((cfg) => map.set(cfg.domain, cfg));
    return map;
  }, [ssoConfigsQuery.data]);

  if (verifiedDomains.length === 0) {
    return (
      <Card className="overflow-hidden">
        <p className="text-muted-foreground px-6 py-12 text-center text-sm">
          Verify a domain in the section above to configure SSO for it.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-4 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-primary pl-2.5">Domain</TableHead>
            <TableHead className="text-primary">Provider</TableHead>
            <TableHead className="text-primary hidden md:table-cell">
              Updated
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody className="text-muted-foreground">
          {verifiedDomains.map((row) => (
            <SsoConfigRow
              key={row.domain}
              orgId={orgId}
              domain={row.domain}
              config={configByDomain.get(row.domain) ?? null}
            />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function SsoConfigRow({
  orgId,
  domain,
  config,
}: {
  orgId: string;
  domain: string;
  config: SsoConfigRow | null;
}) {
  return (
    <TableRow className="hover:bg-primary-foreground">
      <TableCell density="comfortable" className="font-mono">
        {domain}
      </TableCell>
      <TableCell density="comfortable">
        {config ? (
          <Badge variant="default">{providerLabel(config.authProvider)}</Badge>
        ) : (
          <Badge variant="secondary">Not configured</Badge>
        )}
      </TableCell>
      <TableCell density="comfortable" className="hidden md:table-cell">
        {config ? config.updatedAt.toLocaleDateString() : "—"}
      </TableCell>
      <TableCell
        density="comfortable"
        className="flex items-center justify-end gap-2"
      >
        <SsoConfigDialog orgId={orgId} domain={domain} existing={config} />
        {config ? (
          <DeleteSsoConfigButton orgId={orgId} domain={domain} />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function SsoConfigDialog({
  orgId,
  domain,
  existing,
}: {
  orgId: string;
  domain: string;
  existing: SsoConfigRow | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);
  const utils = api.useUtils();

  const defaultValues = useMemo<FormValues>(() => {
    const cfg = (existing?.authConfig ?? {}) as Record<string, unknown>;
    const enterprise = cfg.enterprise as { baseUrl?: string } | undefined;
    return {
      authProvider:
        existing?.authProvider ?? ("okta" as SsoProviderSchema["authProvider"]),
      authConfig: {
        clientId: typeof cfg.clientId === "string" ? cfg.clientId : "",
        clientSecret: "",
        issuer: typeof cfg.issuer === "string" ? cfg.issuer : "",
        tenantId: typeof cfg.tenantId === "string" ? cfg.tenantId : "",
        baseUrl: enterprise?.baseUrl ?? "",
        name: typeof cfg.name === "string" ? cfg.name : "",
      },
    };
  }, [existing]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });
  // Reset the form when the dialog reopens against new defaults (e.g. user
  // toggled between Configure and Update without remounting the component).
  useEffect(() => {
    if (dialogOpen) form.reset(defaultValues);
  }, [dialogOpen, defaultValues, form]);

  const selectedProvider = form.watch("authProvider");
  const providerSpec = useMemo(
    () =>
      SSO_PROVIDERS.find((p) => p.id === selectedProvider) ?? SSO_PROVIDERS[0],
    [selectedProvider],
  );

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/auth/callback/${domain}.${selectedProvider}`;
  }, [domain, selectedProvider]);

  const saveMutation = api.ssoConfig.save.useMutation({
    onSuccess: () => {
      void utils.ssoConfig.get.invalidate({ orgId });
      showSuccessToast({
        title: existing ? "SSO updated" : "SSO configured",
        description: `Active for @${domain} within 1 hour.`,
      });
      setDialogOpen(false);
      setConfirmOpen(false);
      setPendingValues(null);
      form.reset();
    },
    onError: (err) => {
      showErrorToast(
        existing ? "Update failed" : "SSO configuration failed",
        err.message,
      );
    },
  });

  function onSubmit(values: FormValues) {
    setPendingValues(values);
    setConfirmOpen(true);
  }

  function handleConfirm() {
    if (!pendingValues) return;
    const payload = buildSsoPayload(domain, pendingValues);
    const parsed = SsoProviderSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const schemaPath = firstIssue.path.join(".");
      // `buildSsoPayload` re-nests `baseUrl` under `enterprise` for
      // github-enterprise; the strict schema reports errors at the nested
      // path, but the form field is registered flat. Map back so
      // `setError` lands on a watched field and the inline message renders.
      const formPath =
        schemaPath === "authConfig.enterprise.baseUrl"
          ? "authConfig.baseUrl"
          : schemaPath;
      const formField = formPath.startsWith("authConfig.")
        ? (formPath as `authConfig.${"clientId" | "clientSecret" | "issuer" | "tenantId" | "baseUrl" | "name"}`)
        : "authProvider";
      form.setError(formField, { message: firstIssue.message });
      // Defensive fallback: if a future schema path doesn't map cleanly to
      // a registered form field, surface a toast so the user is never left
      // with a silently-closing dialog and no feedback.
      const FORM_FIELDS = [
        "authProvider",
        "authConfig.clientId",
        "authConfig.clientSecret",
        "authConfig.issuer",
        "authConfig.tenantId",
        "authConfig.baseUrl",
        "authConfig.name",
      ];
      if (!FORM_FIELDS.includes(formField)) {
        showErrorToast(
          existing ? "Update failed" : "SSO configuration failed",
          firstIssue.message,
        );
      }
      setConfirmOpen(false);
      return;
    }
    saveMutation.mutate({ orgId, payload: parsed.data });
  }

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant={existing ? "outline" : "default"}>
            {existing ? "Update" : "Configure SSO"}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {existing
                ? `Update SSO for ${domain}`
                : `Configure SSO for ${domain}`}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <DialogBody className="space-y-4">
                <FormField
                  control={form.control}
                  name="authProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select an SSO provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {SSO_PROVIDERS.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <CallbackUrlPanel callbackUrl={callbackUrl} />

                {providerSpec.fields.includes("name") ? (
                  <FormField
                    control={form.control}
                    name="authConfig.name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme SSO" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                <FormField
                  control={form.control}
                  name="authConfig.clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client ID</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="authConfig.clientSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Secret</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="off"
                          placeholder={
                            existing ? "Re-enter to update" : undefined
                          }
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {providerSpec.fields.includes("issuer") ? (
                  <FormField
                    control={form.control}
                    name="authConfig.issuer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Issuer URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.okta.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                {providerSpec.fields.includes("tenantId") ? (
                  <FormField
                    control={form.control}
                    name="authConfig.tenantId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tenant ID</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                {providerSpec.fields.includes("baseUrl") ? (
                  <FormField
                    control={form.control}
                    name="authConfig.baseUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://github.acme.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={saveMutation.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {existing
                ? `Replace SSO for @${domain}?`
                : `Activate SSO for @${domain}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">
                Saving will activate SSO for{" "}
                <span className="font-medium">@{domain}</span> within 1 hour.
                Every user at that domain will be redirected to your identity
                provider on sign-in &mdash; they will not be able to use Google,
                GitHub, password, or any other method until SSO is deleted.
              </span>
              {existing ? (
                <span className="mt-2 block">
                  The new credentials will replace the active configuration.
                </span>
              ) : null}
              <span className="mt-2 block">
                Tip: sign in via the new SSO in a second browser to confirm it
                works before closing this tab.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={saveMutation.isPending}
            >
              {existing ? "Replace" : "Activate SSO"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CallbackUrlPanel({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Callback URL</p>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCellWithCopyButton
                density="comfortable"
                text={callbackUrl}
                className="py-3 font-mono break-all"
              />
            </TableRow>
          </TableBody>
        </Table>
      </Card>
      <p className="text-muted-foreground mt-2 text-xs">
        Add this URL as an authorized redirect URI in your identity provider.
      </p>
    </div>
  );
}

function DeleteSsoConfigButton({
  orgId,
  domain,
}: {
  orgId: string;
  domain: string;
}) {
  const utils = api.useUtils();

  const deleteMutation = api.ssoConfig.delete.useMutation({
    onSuccess: () => {
      void utils.ssoConfig.get.invalidate({ orgId });
      showSuccessToast({
        title: "SSO disabled",
        description: `SSO for @${domain} has been removed.`,
      });
    },
    onError: (err) => {
      showErrorToast("Failed to remove SSO", err.message);
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete SSO for ${domain}`}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove SSO for @{domain}?</AlertDialogTitle>
          <AlertDialogDescription>
            Users at this domain will be able to sign in with any enabled method
            again. Active sessions are not invalidated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ orgId, domain })}
            disabled={deleteMutation.isPending}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Build the SsoProviderSchema-shaped payload from the flat form values.
// Handles the nested github-enterprise.enterprise.baseUrl shape.
function buildSsoPayload(domain: string, values: FormValues) {
  const { authProvider, authConfig } = values;
  // allowDangerousEmailAccountLinking is required for SSO migration of
  // existing accounts. Cross-tenant misuse is prevented by the DNS-verified
  // domain check at save time + the runtime domain enforcement in
  // web/src/server/auth.ts.
  const base = {
    clientId: authConfig.clientId,
    clientSecret: authConfig.clientSecret,
    allowDangerousEmailAccountLinking: true,
  };

  switch (authProvider) {
    case "google":
    case "github":
    case "gitlab":
      return { domain, authProvider, authConfig: base };
    case "github-enterprise":
      return {
        domain,
        authProvider,
        authConfig: {
          ...base,
          enterprise: { baseUrl: authConfig.baseUrl ?? "" },
        },
      };
    case "azure-ad":
      return {
        domain,
        authProvider,
        authConfig: { ...base, tenantId: authConfig.tenantId ?? "" },
      };
    case "auth0":
    case "okta":
    case "authentik":
    case "onelogin":
    case "cognito":
    case "keycloak":
    case "jumpcloud":
      return {
        domain,
        authProvider,
        authConfig: { ...base, issuer: authConfig.issuer ?? "" },
      };
    case "custom":
      return {
        domain,
        authProvider,
        authConfig: {
          ...base,
          issuer: authConfig.issuer ?? "",
          name: authConfig.name ?? "",
        },
      };
    default:
      return { domain, authProvider, authConfig: base };
  }
}
