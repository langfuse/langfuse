import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { QuickstartExamples } from "@/src/features/public-api/components/QuickstartExamples";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

type ApiKeyScope = "project" | "organization";

export function CreateApiKeyButton(props: {
  entityId: string;
  scope: ApiKeyScope;
}) {
  const utils = api.useUtils();
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

  const mutCreateProjectApiKey = api.projectApiKeys.create.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const mutCreateOrgApiKey = api.organizationApiKeys.create.useMutation({
    onSuccess: () => utils.organizationApiKeys.invalidate(),
  });

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [generatedKeys, setGeneratedKeys] = useState<{
    secretKey: string;
    publicKey: string;
  } | null>(null);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setGeneratedKeys(null);
      setNote("");
    }
  };

  const createApiKey = () => {
    if (props.scope === "project") {
      mutCreateProjectApiKey
        .mutateAsync({
          projectId: props.entityId,
          note: note || undefined,
        })
        .then(({ secretKey, publicKey }) => {
          setGeneratedKeys({
            secretKey,
            publicKey,
          });
          capture(`${props.scope}_settings:api_key_create`);
        })
        .catch((error) => {
          console.error(error);
        });
    } else {
      mutCreateOrgApiKey
        .mutateAsync({
          orgId: props.entityId,
          note: note || undefined,
        })
        .then(({ secretKey, publicKey }) => {
          setGeneratedKeys({
            secretKey,
            publicKey,
          });
          capture(`${props.scope}_settings:api_key_create`);
        })
        .catch((error) => {
          console.error(error);
        });
    }
  };

  if (!hasAccess) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
          Create new API keys
        </Button>
      </DialogTrigger>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {generatedKeys ? "API Keys" : "Create API Keys"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {generatedKeys ? (
            <>
              <ApiKeyRender scope={props.scope} generatedKeys={generatedKeys} />
              {props.scope === "project" && (
                <div className="mt-4 max-w-full">
                  <div className="text-md my-2 font-semibold">Usage</div>
                  <QuickstartExamples
                    secretKey={generatedKeys.secretKey}
                    publicKey={generatedKeys.publicKey}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="note">Note (optional)</Label>
                <Input
                  id="note"
                  placeholder="Production key"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      createApiKey();
                    }
                  }}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}
        </DialogBody>
        {!generatedKeys && (
          <DialogFooter>
            <Button
              onClick={createApiKey}
              loading={
                mutCreateProjectApiKey.isPending || mutCreateOrgApiKey.isPending
              }
            >
              Create API keys
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const ApiKeyRender = ({
  scope,
  generatedKeys,
}: {
  scope: ApiKeyScope;
  generatedKeys?: { secretKey: string; publicKey: string };
}) => {
  const uiCustomization = useUiCustomization();
  return (
    <>
      <div className="mb-4">
        <div className="text-md font-semibold">Secret Key</div>
        <div className="my-2 text-sm">
          This key can only be viewed once. You can always create new keys in
          the {scope} settings.
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
