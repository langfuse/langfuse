/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { Alert } from "@/src/components/design-system/Alert/Alert";
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
import { SimpleDataTable } from "@/src/components/table/simple-data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
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
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Row } from "@tanstack/react-table";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

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
    <div className="relative pr-8 font-mono break-all">
      <Header title="Verified Domains" />
      <p className="text-muted-foreground mb-4 text-sm">
        You can only configure SSO for domains your organization owns. Verify a
        domain via DNS to enable SSO for it.
      </p>
    </div>
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
      <DomainsTable orgId={orgId} />
    </div>
  );
};

function DomainsTable({ orgId }: { orgId: string }) {
  const query = api.verifiedDomain.list.useQuery({ orgId });
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());

  const columns: LangfuseColumnDef<DomainRowData>[] = [
    {
      accessorKey: "domain",
      header: "Domain",
      cell: ({ row }) =>
        !row.original.verifiedAt ? (
          <button
            type="button"
            onClick={() =>
              setCollapsedRows((current) => {
                const next = new Set(current);
                if (next.has(row.original.id)) next.delete(row.original.id);
                else next.add(row.original.id);
                return next;
              })
            }
            className="flex items-center gap-1"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${
                collapsedRows.has(row.original.id) ? "" : "rotate-90"
              }`}
            />
            {row.original.domain}
          </button>
        ) : (
          row.original.domain
        ),
    },
    {
      accessorKey: "verifiedAt",
      header: "Status",
      cell: ({ row }) =>
        row.original.verifiedAt ? (
          <Badge variant="default">Verified</Badge>
        ) : (
          <Badge variant="secondary">Pending verification</Badge>
        ),
    },
    {
      accessorKey: "createdAt",
      header: "Added",
      cell: ({ row }) => row.original.createdAt.toLocaleDateString(),
    },
    {
      accessorKey: "id",
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <DomainActions orgId={orgId} row={row.original} />
        </div>
      ),
    },
  ];

  const renderDetailRow = (row: Row<DomainRowData>) =>
    !row.original.verifiedAt && !collapsedRows.has(row.original.id) ? (
      <tr className="bg-muted/30 hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
        <td
          colSpan={4}
          className="h-full border-b px-2 py-4 align-middle [&:has([role=checkbox])]:pr-0 [:last-child_>_&]:border-b-0"
        >
          <DnsInstructions
            recordHost={row.original.recordHost}
            recordValue={row.original.recordValue}
          />
        </td>
      </tr>
    ) : null;

  return (
    <Card className="mb-4 overflow-hidden">
      <SimpleDataTable
        columns={columns}
        data={query.data ?? []}
        isLoading={query.isLoading}
        noResults={<div className="py-10 text-sm">No domains added yet</div>}
        bodyTone="muted"
        rowVariant="primary-hover"
        renderDetailRow={renderDetailRow}
      />
    </Card>
  );
}

type DomainRowData = {
  id: string;
  domain: string;
  verifiedAt: Date | null;
  createdAt: Date;
  recordHost: string;
  recordValue: string;
};

function DomainActions({ orgId, row }: { orgId: string; row: DomainRowData }) {
  const utils = api.useUtils();

  const verifyMutation = api.verifiedDomain.verify.useMutation({
    onSuccess: () => {
      utils.verifiedDomain.list.invalidate({ orgId });
      utils.ssoConfig.get.invalidate({ orgId });
      showSuccessToast({
        title: "Domain verified",
        description: `${row.domain} is now verified.`,
      });
    },
    onError: (err) => {
      showErrorToast("Verification failed", err.message);
    },
  });

  return (
    <>
      {!row.verifiedAt && (
        <Button
          size="sm"
          onClick={() => verifyMutation.mutate({ orgId, id: row.id })}
          loading={verifyMutation.isPending}
        >
          Verify
        </Button>
      )}
      <DeleteDomainButton
        orgId={orgId}
        id={row.id}
        domain={row.domain}
        verified={Boolean(row.verifiedAt)}
      />
    </>
  );
}

function DnsInstructions({
  recordHost,
  recordValue,
}: {
  recordHost: string;
  recordValue: string;
}) {
  const columns: LangfuseColumnDef<{
    type: string;
    host: string;
    value: string;
  }>[] = [
    createTextTableColumn({
      accessorKey: "type",
      header: "Type",
      size: 64,
    }),
    {
      accessorKey: "host",
      header: "Host",
      size: 216,
      cell: ({ getValue }) => <CopyableText value={getValue<string>()} />,
    },
    {
      accessorKey: "value",
      header: "Value",
      cell: ({ getValue }) => <CopyableText value={getValue<string>()} />,
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">
        Add the following TXT record to your DNS provider:
      </p>
      <Card className="overflow-hidden">
        <SimpleDataTable
          columns={columns}
          data={[{ type: "TXT", host: recordHost, value: recordValue }]}
          isLoading={false}
          noResults={null}
        />
      </Card>
      <p className="text-muted-foreground text-xs">
        DNS changes may take up to 24h to propagate. After adding the record,
        click <span className="font-bold">Verify</span>.
      </p>
    </div>
  );
}

function CopyableText({ value }: { value: string }) {
  const { copy, isCopied } = useCopyToClipboard();

  return (
    <>
      <span title={value}>{value}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1/2 right-2 -translate-y-1/2"
        title="Copy to clipboard"
        aria-label="Copy to clipboard"
        onClick={async (event) => {
          event.preventDefault();
          await copy(value).catch(() => undefined);
          event.currentTarget.focus();
        }}
      >
        {isCopied ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </>
  );
}

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
          "Add the DNS TXT record shown in the table, then click Verify.",
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

function DeleteDomainButton({
  orgId,
  id,
  domain,
  verified,
}: {
  orgId: string;
  id: string;
  domain: string;
  verified: boolean;
}) {
  const utils = api.useUtils();

  const deleteMutation = api.verifiedDomain.delete.useMutation({
    onSuccess: () => {
      utils.verifiedDomain.list.invalidate({ orgId });
      showSuccessToast({
        title: "Domain removed",
        description: `${domain} has been removed.`,
      });
    },
    onError: (err) => {
      showErrorToast("Failed to remove domain", err.message);
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Delete ${domain}`}>
          <TrashIcon className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {domain}?</AlertDialogTitle>
          <AlertDialogDescription>
            {verified
              ? "If an SSO configuration exists for this domain, you must remove it first. The domain can be re-verified later."
              : "This removes the pending claim. The domain can be re-added and verified later."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ orgId, id })}
            disabled={deleteMutation.isPending}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
