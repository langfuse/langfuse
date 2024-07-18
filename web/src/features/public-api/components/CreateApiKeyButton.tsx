import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { QuickstartExamples } from "@/src/features/public-api/components/QuickstartExamples";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function CreateApiKeyButton(props: { projectId: string }) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "apiKeys:create",
  });

  const hostname = window.origin;

  const mutCreateApiKey = api.apiKeys.create.useMutation({
    onSuccess: () => utils.apiKeys.invalidate(),
  });
  const [open, setOpen] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{
    secretKey: string;
    publicKey: string;
  } | null>(null);

  const createApiKey = () => {
    if (open) {
      setOpen(false);
      setGeneratedKeys(null);
    } else {
      mutCreateApiKey
        .mutateAsync({
          projectId: props.projectId,
        })
        .then(({ secretKey, publicKey }) => {
          setGeneratedKeys({
            secretKey,
            publicKey,
          });
          setOpen(true);
          capture("project_settings:api_key_create");
        })
        .catch((error) => {
          console.error(error);
        });
    }
  };

  if (!hasAccess) return null;

  return (
    <Dialog open={open} onOpenChange={createApiKey}>
      <DialogTrigger asChild>
        <Button variant="secondary" loading={mutCreateApiKey.isLoading}>
          <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
          Create new API keys
        </Button>
      </DialogTrigger>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        className="flex max-h-screen w-full flex-col md:max-w-xl"
      >
        <DialogTitle>API Keys</DialogTitle>
        <div className="shrink overflow-x-hidden overflow-y-scroll">
          <div className="mb-2">
            <div className="text-md font-semibold">Secret Key</div>
            <div className="my-2">
              This key can only be viewed once. You can always generate a new
              key.
            </div>
            <CodeView content={generatedKeys?.secretKey ?? "Loading ..."} />
          </div>
          <div>
            <div className="text-md mb-2 font-semibold">Public Key</div>
            <CodeView content={generatedKeys?.publicKey ?? "Loading ..."} />
          </div>
          <div>
            <div className="text-md mb-2 font-semibold">Host</div>
            <CodeView content={hostname} />
          </div>
          {generatedKeys && (
            <div className="mb-2 max-w-full">
              <div className="text-md my-2 font-semibold">Usage</div>
              <QuickstartExamples
                secretKey={generatedKeys.secretKey}
                publicKey={generatedKeys.publicKey}
                host={hostname}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
