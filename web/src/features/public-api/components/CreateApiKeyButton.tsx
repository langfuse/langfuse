import { Button } from "@/src/components/ui/button";
import { Dialog, DialogTrigger } from "@/src/components/ui/dialog";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import {
  ApiKeyCreateDialogContent,
  type ApiKeyCreateValues,
} from "@/src/features/public-api/components/ApiKeyCreateDialogContent";

type ApiKeyScope = "project" | "organization";

export function CreateApiKeyButton(props: {
  entityId: string;
  scope: ApiKeyScope;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();

  const mutCreateProjectApiKey = api.projectApiKeys.create.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const mutCreateOrgApiKey = api.organizationApiKeys.create.useMutation({
    onSuccess: () => utils.organizationApiKeys.invalidate(),
  });

  const [open, setOpen] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{
    secretKey: string;
    publicKey: string;
  } | null>(null);
  const baseUrl = useLangfuseBaseUrl();

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) setGeneratedKeys(null);
  };

  const onCreated = (keys: { secretKey: string; publicKey: string }) => {
    setGeneratedKeys(keys);
  };

  const createApiKey = (values: ApiKeyCreateValues) => {
    if (props.scope === "project") {
      mutCreateProjectApiKey
        .mutateAsync({
          projectId: props.entityId,
          note: values.note || undefined,
          role: values.role,
          expiresAt: values.expiresAt,
        })
        .then(({ secretKey, publicKey }) => {
          onCreated({ secretKey, publicKey });
          capture(`${props.scope}_settings:api_key_create`, {
            role: values.role,
            expiresAt: values.expiresAt?.toISOString() ?? null,
          });
        })
        .catch((error) => reportNonTrpcError(error, "api-keys"));
    } else {
      mutCreateOrgApiKey
        .mutateAsync({
          orgId: props.entityId,
          note: values.note || undefined,
          role: values.role,
          expiresAt: values.expiresAt,
        })
        .then(({ secretKey, publicKey }) => {
          onCreated({ secretKey, publicKey });
          capture(`${props.scope}_settings:api_key_create`, {
            role: values.role,
            expiresAt: values.expiresAt?.toISOString() ?? null,
          });
        })
        .catch((error) => reportNonTrpcError(error, "api-keys"));
    }
  };

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
              onSubmit: createApiKey,
              isPending:
                mutCreateProjectApiKey.isPending ||
                mutCreateOrgApiKey.isPending,
            })}
      />
    </Dialog>
  );
}
