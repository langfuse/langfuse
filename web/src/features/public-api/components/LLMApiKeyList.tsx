import { TrashIcon } from "lucide-react";
import { useState } from "react";

import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
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
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { DialogDescription } from "@radix-ui/react-dialog";

import { CreateLLMApiKeyDialog } from "./CreateLLMApiKeyDialog";
import { useIsEeEnabled } from "@/src/ee/utils/useIsEeEnabled";

export function LlmApiKeyList(props: { projectId: string }) {
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "llmApiKeys:read",
  });
  const isEeEnabled = useIsEeEnabled();

  const apiKeys = api.llmApiKey.all.useQuery(
    {
      projectId: props.projectId,
    },
    {
      enabled: hasAccess && isEeEnabled,
    },
  );

  if (!hasAccess) return null;
  if (!isEeEnabled) return null;

  return (
    <div id="llm-api-keys">
      <Header title="LLM API keys" level="h3" />
      <p className="mb-4 text-sm">
        These keys are used to power the Langfuse playground and evaluations
        feature and will incur costs based on usage with your key provider.
      </p>
      <Card className="mb-4 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden text-primary md:table-cell">
                Created
              </TableHead>
              <TableHead className="text-primary md:table-cell">
                Provider
              </TableHead>
              <TableHead className="hidden text-primary md:table-cell">
                Adapter
              </TableHead>
              <TableHead className="text-primary md:table-cell">
                Base URL
              </TableHead>
              <TableHead className="text-primary">Secret Key</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody className="text-muted-foreground">
            {apiKeys.data?.data.map((apiKey) => (
              <TableRow key={apiKey.id} className="hover:bg-primary-foreground">
                <TableCell className="hidden md:table-cell">
                  {apiKey.createdAt.toLocaleDateString()}
                </TableCell>
                <TableCell className="font-mono">{apiKey.provider}</TableCell>
                <TableCell className="hidden font-mono">
                  {apiKey.adapter}
                </TableCell>
                <TableCell className="max-w-md overflow-auto font-mono">
                  {apiKey.baseURL ?? "default"}
                </TableCell>
                <TableCell className="font-mono">
                  {apiKey.displaySecretKey}
                </TableCell>
                <TableCell>
                  <DeleteApiKeyButton
                    projectId={props.projectId}
                    apiKeyId={apiKey.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <CreateLLMApiKeyDialog />
    </div>
  );
}

// show dialog to let user confirm that this is a destructive action
function DeleteApiKeyButton(props: { projectId: string; apiKeyId: string }) {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "llmApiKeys:delete",
  });

  const utils = api.useUtils();
  const mutDeleteApiKey = api.llmApiKey.delete.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
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
          <DialogTitle className="mb-5">Delete LLM provider</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Are you sure you want to delete this LLM provider? This action cannot
          be undone.
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
                  capture("project_settings:llm_api_key_delete");
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
