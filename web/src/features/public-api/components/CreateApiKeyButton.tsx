import { Button } from "@/src/components/ui/button";
import { Dialog, DialogTrigger } from "@/src/components/ui/dialog";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { ApiKeyCreateDialogContent } from "@/src/features/public-api/components/ApiKeyCreateDialogContent";

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
  const baseUrl = useLangfuseBaseUrl();

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
          <PlusIcon className="mr-1.5 -ml-0.5 h-5 w-5" aria-hidden="true" />
          Create new API keys
        </Button>
      </DialogTrigger>
      <ApiKeyCreateDialogContent
        scope={props.scope}
        {...(generatedKeys
          ? {
              type: "detail" as const,
              secretKey: generatedKeys.secretKey,
              publicKey: generatedKeys.publicKey,
              baseUrl,
              showMcpSection: true,
            }
          : {
              type: "form" as const,
              note,
              onNoteChange: setNote,
              onSubmit: createApiKey,
              isPending:
                mutCreateProjectApiKey.isPending ||
                mutCreateOrgApiKey.isPending,
            })}
      />
    </Dialog>
  );
}
