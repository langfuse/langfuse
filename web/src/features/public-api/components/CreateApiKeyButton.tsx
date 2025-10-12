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
import { QuickstartExamples } from "@/src/features/public-api/components/QuickstartExamples";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";
import { useTranslation } from "react-i18next";

type ApiKeyScope = "project" | "organization";

export function CreateApiKeyButton(props: {
  entityId: string;
  scope: ApiKeyScope;
}) {
  const { t } = useTranslation();
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
          {t("project.settings.apiKeys.createNewApiKeys")}
        </Button>
      </DialogTrigger>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("project.settings.apiKeys.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <ApiKeyRender
            scope={props.scope}
            generatedKeys={generatedKeys ?? undefined}
          />
          {generatedKeys && props.scope === "project" && (
            <div className="mt-4 max-w-full">
              <div className="text-md my-2 font-semibold">
                {t("project.settings.apiKeys.usage")}
              </div>
              <QuickstartExamples
                secretKey={generatedKeys.secretKey}
                publicKey={generatedKeys.publicKey}
              />
            </div>
          )}
        </DialogBody>
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
        <div className="text-md font-semibold">
          {t("project.settings.apiKeys.secretKey")}
        </div>
        <div className="my-2 text-sm">
          {t("project.settings.apiKeys.secretKeyDescription", { scope })}
        </div>
        <CodeView content={generatedKeys?.secretKey ?? "Loading ..."} />
      </div>
      <div className="mb-4">
        <div className="text-md mb-2 font-semibold">
          {t("project.settings.apiKeys.publicKey")}
        </div>
        <CodeView content={generatedKeys?.publicKey ?? "Loading ..."} />
      </div>
      <div>
        <div className="text-md mb-2 font-semibold">
          {t("project.settings.apiKeys.host")}
        </div>
        <CodeView
          content={`${uiCustomization?.hostname ?? window.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`}
        />
      </div>
    </>
  );
};
