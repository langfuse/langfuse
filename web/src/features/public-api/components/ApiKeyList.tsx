import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { Input } from "@/src/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { CreateApiKeyButton } from "@/src/features/public-api/components/CreateApiKeyButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { DialogDescription } from "@radix-ui/react-dialog";
import { TrashIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { startCase } from "lodash";
import { useTranslation } from "react-i18next";

type ApiKeyScope = "project" | "organization";
type ApiKeyEntity = { id: string; note: string | null };

export function ApiKeyList(props: { entityId: string; scope: ApiKeyScope }) {
  const { t } = useTranslation();
  const { entityId, scope } = props;
  if (!entityId) {
    throw new Error(
      `${scope}Id is required for ApiKeyList with scope ${scope}`,
    );
  }

  const hasProjectAccess = useHasProjectAccess({
    projectId: props.entityId,
    scope: "apiKeys:CUD",
  });
  const hasOrganizationAccess = useHasOrganizationAccess({
    organizationId: props.entityId,
    scope: "organization:CRUD_apiKeys",
  });

  const hasAccess =
    props.scope === "project" ? hasProjectAccess : hasOrganizationAccess;

  const projectApiKeysQuery = api.projectApiKeys.byProjectId.useQuery(
    { projectId: entityId },
    { enabled: hasProjectAccess && props.scope === "project" },
  );
  const organizationApiKeysQuery =
    api.organizationApiKeys.byOrganizationId.useQuery(
      { orgId: entityId },
      { enabled: hasOrganizationAccess && props.scope === "organization" },
    );
  const apiKeysQuery =
    props.scope === "project" ? projectApiKeysQuery : organizationApiKeysQuery;

  if (!hasAccess) {
    return (
      <div>
        <Header title={t("project.settings.apiKeys.title")} />
        <Alert>
          <AlertTitle>{t("project.settings.apiKeys.accessDenied")}</AlertTitle>
          <AlertDescription>
            {t("project.settings.apiKeys.noPermission", { scope })}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={
          scope === "project"
            ? t("project.settings.apiKeys.projectApiKeys")
            : startCase(`${scope} API keys`)
        }
        help={{
          description: t("project.settings.apiKeys.learnMore", { scope }),
          href:
            scope === "project"
              ? "https://langfuse.com/docs/api#authentication"
              : "https://langfuse.com/docs/api#org-scoped-routes",
        }}
      />
      <Card className="mb-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden text-primary md:table-cell">
                {t("project.settings.apiKeys.created")}
              </TableHead>
              <TableHead className="text-primary">
                {t("project.settings.apiKeys.note")}
              </TableHead>
              <TableHead className="text-primary">
                {t("project.settings.apiKeys.publicKey")}
              </TableHead>
              <TableHead className="text-primary">
                {t("project.settings.apiKeys.secretKey")}
              </TableHead>
              {/* <TableHead className="text-primary">Last used</TableHead> */}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody className="text-muted-foreground">
            {apiKeysQuery.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  {t("project.settings.apiKeys.none")}
                </TableCell>
              </TableRow>
            ) : (
              apiKeysQuery.data?.map((apiKey) => (
                <TableRow
                  key={apiKey.id}
                  className="hover:bg-primary-foreground"
                >
                  <TableCell className="hidden md:table-cell">
                    {apiKey.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <ApiKeyNote
                      apiKey={apiKey}
                      entityId={entityId}
                      scope={scope}
                    />
                  </TableCell>
                  <TableCell className="font-mono">
                    <CodeView
                      className="inline-block text-xs"
                      content={apiKey.publicKey}
                    />
                  </TableCell>
                  <TableCell className="font-mono">
                    {apiKey.displaySecretKey}
                  </TableCell>
                  {/* <TableCell>
                  {apiKey.lastUsedAt?.toLocaleDateString() ?? "Never"}
                </TableCell> */}
                  <TableCell>
                    <DeleteApiKeyButton
                      entityId={entityId}
                      apiKeyId={apiKey.id}
                      scope={scope}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <CreateApiKeyButton entityId={entityId} scope={scope} />
    </div>
  );
}

// show dialog to let user confirm that this is a destructive action
function DeleteApiKeyButton(props: {
  entityId: string;
  apiKeyId: string;
  scope: ApiKeyScope;
}) {
  const { entityId, apiKeyId, scope } = props;
  const capture = usePostHogClientCapture();

  const hasProjectAccess = useHasProjectAccess({
    projectId: props.entityId,
    scope: "apiKeys:CUD",
  });
  const hasOrganizationAccess = useHasOrganizationAccess({
    organizationId: props.entityId,
    scope: "organization:CRUD_apiKeys",
  });

  const hasAccess =
    props.scope === "project" ? hasProjectAccess : hasOrganizationAccess;

  const utils = api.useUtils();

  const mutDeleteProjectApiKey = api.projectApiKeys.delete.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const mutDeleteOrgApiKey = api.organizationApiKeys.delete.useMutation({
    onSuccess: () => utils.organizationApiKeys.invalidate(),
  });

  const [open, setOpen] = useState(false);

  if (!hasAccess) return null;

  const handleDelete = () => {
    if (scope === "project") {
      mutDeleteProjectApiKey
        .mutateAsync({
          projectId: entityId,
          id: apiKeyId,
        })
        .then(() => {
          capture(`${scope}_settings:api_key_delete`);
          setOpen(false);
        })
        .catch((error) => {
          console.error(error);
        });
    } else {
      mutDeleteOrgApiKey
        .mutateAsync({
          orgId: entityId,
          id: apiKeyId,
        })
        .then(() => {
          capture(`${scope}_settings:api_key_delete`);
          setOpen(false);
        })
        .catch((error) => {
          console.error(error);
        });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <TrashIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="mb-5">Delete API key</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this API key? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={handleDelete}
            loading={
              mutDeleteOrgApiKey.isPending || mutDeleteProjectApiKey.isPending
            }
          >
            Permanently delete
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeyNote({
  apiKey,
  entityId,
  scope,
}: {
  apiKey: ApiKeyEntity;
  entityId: string;
  scope: ApiKeyScope;
}) {
  const utils = api.useUtils();

  const hasProjectAccess = useHasProjectAccess({
    projectId: entityId,
    scope: "apiKeys:CUD",
  });
  const hasOrganizationAccess = useHasOrganizationAccess({
    organizationId: entityId,
    scope: "organization:CRUD_apiKeys",
  });
  const hasEditAccess =
    scope === "project" ? hasProjectAccess : hasOrganizationAccess;

  const mutUpdateProjectApiKey = api.projectApiKeys.updateNote.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const mutUpdateOrgApiKey = api.organizationApiKeys.updateNote.useMutation({
    onSuccess: () => utils.organizationApiKeys.invalidate(),
  });

  const [note, setNote] = useState(apiKey.note ?? "");
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    setIsEditing(false);
    if (note !== apiKey.note) {
      if (scope === "project") {
        mutUpdateProjectApiKey.mutate({
          projectId: entityId,
          keyId: apiKey.id,
          note,
        });
      } else {
        mutUpdateOrgApiKey.mutate({
          orgId: entityId,
          keyId: apiKey.id,
          note,
        });
      }
    }
  };

  if (!hasEditAccess) return note ?? "";

  if (isEditing) {
    return (
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={handleBlur}
        autoFocus
        className="h-8"
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="-mx-2 cursor-pointer rounded px-2 py-1 hover:bg-secondary/50"
    >
      {note || "Click to add note"}
    </div>
  );
}
