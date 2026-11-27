/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogTrigger } from "@/src/components/ui/dialog";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { useState } from "react";
import { PlusIcon } from "@langfuse/icons";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useLangfuseBaseUrl } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { useOrganizationProjects } from "@/src/features/public-api/hooks/useOrganizationProjects";
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
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const baseUrl = useLangfuseBaseUrl();
  const organizationProjects = useOrganizationProjects(props.entityId);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) setSecretKey(null);
  };

  const createApiKey = (values: ApiKeyCreateValues) => {
    if (props.scope === "project") {
      mutCreateProjectApiKey
        .mutateAsync({
          projectId: props.entityId,
          name: values.name || undefined,
          ...(values.role === undefined ? {} : { role: values.role }),
          expiresAt: values.expiresAt,
        })
        .then((created) => {
          setSecretKey(created.secretKey);
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
          name: values.name || undefined,
          ...(values.role === undefined ? {} : { role: values.role }),
          expiresAt: values.expiresAt,
        })
        .then((created) => {
          setSecretKey(created.secretKey);
          capture(`${props.scope}_settings:api_key_create`, {
            role: values.role,
            expiresAt: values.expiresAt?.toISOString() ?? null,
          });
        })
        .catch((error) => reportNonTrpcError(error, "api-keys"));
    }
  };

  const dialogContent = () => {
    if (secretKey === null) {
      return (
        <ApiKeyCreateDialogContent
          type="form"
          scope={props.scope}
          onSubmit={createApiKey}
          isPending={
            mutCreateProjectApiKey.isPending || mutCreateOrgApiKey.isPending
          }
        />
      );
    }
    if (props.scope === "project") {
      return (
        <ApiKeyCreateDialogContent
          type="detail"
          scope="project"
          projectId={props.entityId}
          secretKey={secretKey}
          baseUrl={baseUrl}
        />
      );
    }
    return (
      <ApiKeyCreateDialogContent
        type="detail"
        scope="organization"
        projects={organizationProjects}
        secretKey={secretKey}
        baseUrl={baseUrl}
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <PlusIcon
            size="base"
            __rawClassName="mr-1.5 -ml-0.5"
            aria-hidden="true"
          />
          Create new API keys
        </Button>
      </DialogTrigger>
      {dialogContent()}
    </Dialog>
  );
}
