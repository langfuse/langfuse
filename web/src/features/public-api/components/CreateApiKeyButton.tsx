import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";
import { SubHeader } from "@/src/components/layouts/header";

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
  const [generatedKeys, setGeneratedKeys] = useState<{
    secretKey: string;
    publicKey: string;
  } | null>(null);

  const createApiKey = () => {
    if (open) {
      setOpen(false);
      setGeneratedKeys(null);
    } else {
      if (props.scope === "project") {
        mutCreateProjectApiKey
          .mutateAsync({
            projectId: props.entityId,
          })
          .then(({ secretKey, publicKey }) => {
            setGeneratedKeys({
              secretKey,
              publicKey,
            });
            setOpen(true);
            capture(`${props.scope}_settings:api_key_create`);
          })
          .catch((error) => {
            console.error(error);
          });
      } else {
        mutCreateOrgApiKey
          .mutateAsync({
            orgId: props.entityId,
          })
          .then(({ secretKey, publicKey }) => {
            setGeneratedKeys({
              secretKey,
              publicKey,
            });
            setOpen(true);
            capture(`${props.scope}_settings:api_key_create`);
          })
          .catch((error) => {
            console.error(error);
          });
      }
    }
  };

  if (!hasAccess) return null;

  return (
    <Dialog open={open} onOpenChange={createApiKey}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          loading={
            mutCreateProjectApiKey.isPending || mutCreateOrgApiKey.isPending
          }
        >
          <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
          Create new API keys
        </Button>
      </DialogTrigger>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>API Keys</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <ApiKeyRender
            scope={props.scope}
            generatedKeys={generatedKeys ?? undefined}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export const ApiKeyRender = ({
  scope,
  generatedKeys,
  className,
}: {
  scope: ApiKeyScope;
  generatedKeys?: { secretKey: string; publicKey: string };
  className?: string;
}) => {
  const uiCustomization = useUiCustomization();
  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <SubHeader title="Secret Key" />
        <div className="text-sm text-muted-foreground">
          This key can only be viewed once. You can always create new keys in
          the {scope} settings.
        </div>
        <CodeView
          content={generatedKeys?.secretKey ?? "Loading ..."}
          className="mt-2"
        />
      </div>
      <div>
        <SubHeader title="Public Key" />
        <CodeView
          content={generatedKeys?.publicKey ?? "Loading ..."}
          className="mt-2"
        />
      </div>
      <div>
        <SubHeader title="Host" />
        <CodeView
          content={`${uiCustomization?.hostname ?? window.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`}
          className="mt-2"
        />
      </div>
    </div>
  );
};
