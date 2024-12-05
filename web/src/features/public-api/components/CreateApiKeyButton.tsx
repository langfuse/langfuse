import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { QuickstartExamples } from "@/src/features/public-api/components/QuickstartExamples";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

export function CreateApiKeyButton(props: { projectId: string }) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "apiKeys:create",
  });

  const mutCreateApiKey = api.apiKeys.create.useMutation({
    onSuccess: () => utils.apiKeys.invalidate(),
  });
  const [open, setOpen] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{
    secretKey: string;
    publicKey: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setOpen(false);
      setGeneratedKeys(null);
      setNote("");
    } else {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleCreateApiKey = () => {
    mutCreateApiKey
      .mutateAsync({
        projectId: props.projectId,
        note: note || undefined,
      })
      .then(({ secretKey, publicKey }) => {
        setGeneratedKeys({
          secretKey,
          publicKey,
        });
        capture("project_settings:api_key_create");
      })
      .catch((error) => {
        console.error(error);
      });
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleCreateApiKey();
    }
  };

  if (!hasAccess) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" loading={mutCreateApiKey.isLoading}>
          <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
          Create new API key
        </Button>
      </DialogTrigger>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        className="flex max-h-screen w-full flex-col md:max-w-xl"
      >
        <DialogTitle>Create new API key</DialogTitle>
        {!generatedKeys ? (
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="note">Note (optional)</Label>
              <p className="text-sm text-muted-foreground">
                Add a note to help you remember what this key is for.
              </p>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Add a note for this API key"
                className="mt-2"
                ref={inputRef}
              />
            </div>
            <Button
              variant="secondary"
              onClick={handleCreateApiKey}
              loading={mutCreateApiKey.isLoading}
            >
              Create API Key
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <ApiKeyRender generatedKeys={generatedKeys} />
            <div className="mt-4 max-w-full">
              <div className="text-md my-2 font-semibold">Usage</div>
              <QuickstartExamples
                secretKey={generatedKeys.secretKey}
                publicKey={generatedKeys.publicKey}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const ApiKeyRender = ({
  generatedKeys,
}: {
  generatedKeys?: { secretKey: string; publicKey: string };
}) => {
  const uiCustomization = useUiCustomization();
  return (
    <>
      <div className="mb-4">
        <div className="text-md font-semibold">Secret Key</div>
        <div className="my-2 text-sm">
          This key can only be viewed once. You can always create new keys in
          the project settings.
        </div>
        <CodeView content={generatedKeys?.secretKey ?? "Loading ..."} />
      </div>
      <div className="mb-4">
        <div className="text-md mb-2 font-semibold">Public Key</div>
        <CodeView content={generatedKeys?.publicKey ?? "Loading ..."} />
      </div>
      <div>
        <div className="text-md mb-2 font-semibold">Host</div>
        <CodeView
          content={`${uiCustomization?.hostname ?? window.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`}
        />
      </div>
    </>
  );
};
