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
import { api } from "@/src/utils/api";
import { DialogDescription } from "@radix-ui/react-dialog";
import { TrashIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";

export function ApiKeyList(props: { projectId: string }) {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "apiKeys:read",
  });

  const apiKeys = api.apiKeys.byProjectId.useQuery(
    {
      projectId: props.projectId,
    },
    {
      enabled: hasAccess,
    },
  );

  if (!hasAccess) {
    return (
      <div>
        <Header title="API Keys" />
        <Alert>
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view API keys for this project.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <Header title="API Keys" />
      <Card className="mb-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden text-primary md:table-cell">
                Created
              </TableHead>
              <TableHead className="text-primary">Note</TableHead>
              <TableHead className="text-primary">Public Key</TableHead>
              <TableHead className="text-primary">Secret Key</TableHead>
              {/* <TableHead className="text-primary">Last used</TableHead> */}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody className="text-muted-foreground">
            {apiKeys.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  None
                </TableCell>
              </TableRow>
            ) : (
              apiKeys.data?.map((apiKey) => (
                <TableRow
                  key={apiKey.id}
                  className="hover:bg-primary-foreground"
                >
                  <TableCell className="hidden md:table-cell">
                    {apiKey.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <ApiKeyNote apiKey={apiKey} projectId={props.projectId} />
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
                      projectId={props.projectId}
                      apiKeyId={apiKey.id}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <CreateApiKeyButton projectId={props.projectId} />
    </div>
  );
}

// show dialog to let user confirm that this is a destructive action
function DeleteApiKeyButton(props: { projectId: string; apiKeyId: string }) {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "apiKeys:CUD",
  });

  const utils = api.useUtils();
  const mutDeleteApiKey = api.apiKeys.delete.useMutation({
    onSuccess: () => utils.apiKeys.invalidate(),
  });
  const [open, setOpen] = useState(false);

  if (!hasAccess) return null;

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
        </DialogHeader>
        <DialogDescription>
          Are you sure you want to delete this API key? This action cannot be
          undone.
        </DialogDescription>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => {
              mutDeleteApiKey
                .mutateAsync({
                  projectId: props.projectId,
                  id: props.apiKeyId,
                })
                .then(() => {
                  capture("project_settings:api_key_delete");
                  setOpen(false);
                })
                .catch((error) => {
                  console.error(error);
                });
            }}
            loading={mutDeleteApiKey.isLoading}
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
  projectId,
}: {
  apiKey: { id: string; note: string | null };
  projectId: string;
}) {
  const utils = api.useUtils();
  const updateNote = api.apiKeys.updateNote.useMutation({
    onSuccess: () => {
      utils.apiKeys.invalidate();
    },
  });
  const hasEditAccess = useHasProjectAccess({
    projectId,
    scope: "apiKeys:CUD",
  });

  const [note, setNote] = useState(apiKey.note ?? "");
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    setIsEditing(false);
    if (note !== apiKey.note) {
      updateNote.mutate({
        projectId,
        keyId: apiKey.id,
        note,
      });
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
