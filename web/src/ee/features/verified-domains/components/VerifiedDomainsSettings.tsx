/* eslint-disable @repo/no-abstracted-overlay-trigger */
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
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ChevronRight, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTranslations } from "next-intl";

const createAddDomainSchema = (invalidDomainMessage: string) =>
  z.object({
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
        { message: invalidDomainMessage },
      ),
  });

type AddDomainInput = z.infer<ReturnType<typeof createAddDomainSchema>>;

export const VerifiedDomainsSettings = ({ orgId }: { orgId: string }) => {
  const t = useTranslations("settingsEnterprise.verifiedDomains");
  const hasEntitlement = useHasEntitlement("cloud-multi-tenant-sso");
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organization:update",
  });

  const heading = (
    <>
      <Header title={t("title")} />
      <p className="text-muted-foreground mb-4 text-sm">{t("description")}</p>
    </>
  );

  if (!hasEntitlement) {
    return (
      <div>
        {heading}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("notAvailable")}</AlertTitle>
          <AlertDescription>{t("notAvailableDescription")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div>
        {heading}
        <Alert>
          <AlertTitle>{t("accessDenied")}</AlertTitle>
          <AlertDescription>{t("accessDeniedDescription")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title={t("title")}
        actionButtons={<AddDomainButton orgId={orgId} />}
      />
      <p className="text-muted-foreground text-sm">{t("description")}</p>
      <DomainsTable orgId={orgId} />
    </div>
  );
};

function DomainsTable({ orgId }: { orgId: string }) {
  const t = useTranslations("settingsEnterprise.verifiedDomains");
  const query = api.verifiedDomain.list.useQuery({ orgId });

  return (
    <Card className="mb-4 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-primary pl-2.5">{t("domain")}</TableHead>
            <TableHead className="text-primary">{t("status")}</TableHead>
            <TableHead className="text-primary hidden md:table-cell">
              {t("added")}
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody className="text-muted-foreground">
          {query.data && query.data.length === 0 ? (
            <TableRow>
              <TableCell
                density="comfortable"
                colSpan={4}
                className="py-12 text-center text-sm"
              >
                {t("empty")}
              </TableCell>
            </TableRow>
          ) : (
            query.data?.map((row) => (
              <DomainRow key={row.id} orgId={orgId} row={row} />
            ))
          )}
        </TableBody>
      </Table>
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

function DomainRow({ orgId, row }: { orgId: string; row: DomainRowData }) {
  const t = useTranslations("settingsEnterprise.verifiedDomains");
  const [expanded, setExpanded] = useState(!row.verifiedAt);
  const utils = api.useUtils();

  const verifyMutation = api.verifiedDomain.verify.useMutation({
    onSuccess: () => {
      utils.verifiedDomain.list.invalidate({ orgId });
      utils.ssoConfig.get.invalidate({ orgId });
      showSuccessToast({
        title: t("verifiedToast"),
        description: t("verifiedDescription", { domain: row.domain }),
      });
    },
    onError: (err) => {
      showErrorToast(t("verificationFailed"), err.message);
    },
  });

  return (
    <>
      <TableRow className="hover:bg-primary-foreground">
        <TableCell density="comfortable" className="font-mono">
          {!row.verifiedAt ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1"
            >
              <ChevronRight
                className={`h-3 w-3 transition-transform ${
                  expanded ? "rotate-90" : ""
                }`}
              />
              {row.domain}
            </button>
          ) : (
            row.domain
          )}
        </TableCell>
        <TableCell density="comfortable">
          {row.verifiedAt ? (
            <Badge variant="default">{t("verified")}</Badge>
          ) : (
            <Badge variant="secondary">{t("pending")}</Badge>
          )}
        </TableCell>
        <TableCell density="comfortable" className="hidden md:table-cell">
          {row.createdAt.toLocaleDateString()}
        </TableCell>
        <TableCell
          density="comfortable"
          className="flex items-center justify-end gap-2"
        >
          {!row.verifiedAt && (
            <Button
              size="sm"
              onClick={() => verifyMutation.mutate({ orgId, id: row.id })}
              loading={verifyMutation.isPending}
            >
              {t("verify")}
            </Button>
          )}
          <DeleteDomainButton
            orgId={orgId}
            id={row.id}
            domain={row.domain}
            verified={Boolean(row.verifiedAt)}
          />
        </TableCell>
      </TableRow>
      {!row.verifiedAt && expanded && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={4} className="py-4">
            <DnsInstructions
              recordHost={row.recordHost}
              recordValue={row.recordValue}
            />
          </TableCell>
        </TableRow>
      )}
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
  const t = useTranslations("settingsEnterprise.verifiedDomains");
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">{t("dnsInstruction")}</p>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("type")}</TableHead>
              <TableHead className="w-54">{t("host")}</TableHead>
              <TableHead>{t("value")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell density="comfortable" className="w-16 font-mono">
                TXT
              </TableCell>
              <TableCellWithCopyButton
                density="comfortable"
                text={recordHost}
                className="w-54 py-3 font-mono break-all"
              />
              <TableCellWithCopyButton
                density="comfortable"
                text={recordValue}
                className="py-3 font-mono break-all"
              />
            </TableRow>
          </TableBody>
        </Table>
      </Card>
      <p className="text-muted-foreground text-xs">
        {t.rich("dnsPropagation", {
          strong: (chunks) => <span className="font-bold">{chunks}</span>,
        })}
      </p>
    </div>
  );
}

function AddDomainButton({ orgId }: { orgId: string }) {
  const t = useTranslations("settingsEnterprise.verifiedDomains");
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const addDomainSchema = useMemo(
    () => createAddDomainSchema(t("validDomain")),
    [t],
  );

  const form = useForm<AddDomainInput>({
    resolver: zodResolver(addDomainSchema),
    defaultValues: { domain: "" },
  });

  const createMutation = api.verifiedDomain.create.useMutation({
    onSuccess: () => {
      utils.verifiedDomain.list.invalidate({ orgId });
      showSuccessToast({
        title: t("addedToast"),
        description: t("addedDescription"),
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
        <Button size="sm">{t("addDomain")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogBody>
              <FormField
                control={form.control}
                name="domain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("domain")}</FormLabel>
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
                {t("cancel")}
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                {t("add")}
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
  const t = useTranslations("settingsEnterprise.verifiedDomains");
  const utils = api.useUtils();

  const deleteMutation = api.verifiedDomain.delete.useMutation({
    onSuccess: () => {
      utils.verifiedDomain.list.invalidate({ orgId });
      showSuccessToast({
        title: t("removedToast"),
        description: t("removedDescription", { domain }),
      });
    },
    onError: (err) => {
      showErrorToast(t("removeFailed"), err.message);
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("deleteAriaLabel", { domain })}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeTitle", { domain })}</AlertDialogTitle>
          <AlertDialogDescription>
            {verified
              ? t("verifiedRemoveDescription")
              : t("pendingRemoveDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ orgId, id })}
            disabled={deleteMutation.isPending}
          >
            {t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
