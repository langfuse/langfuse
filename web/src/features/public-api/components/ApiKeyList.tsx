import startCase from "lodash/startCase";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import Header from "@/src/components/layouts/header";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { CreateApiKeyButton } from "@/src/features/public-api/components/CreateApiKeyButton";
import { ConnectedApiKeySettingsTable } from "@/src/features/public-api/components/ApiKeySettingsTable/ConnectedApiKeySettingsTable";
import { useLangfuseEnvCode } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import {
  useHasOrganizationAccess,
  useHasProjectAccess,
} from "@/src/features/rbac";

type ApiKeyScope = "project" | "organization";

export function ApiKeyList(props: { entityId: string; scope: ApiKeyScope }) {
  const { entityId, scope } = props;
  const envCode = useLangfuseEnvCode();

  if (!entityId) {
    throw new Error(
      `${scope}Id is required for ApiKeyList with scope ${scope}`,
    );
  }

  const hasProjectReadAccess = useHasProjectAccess({
    projectId: entityId,
    scope: "apiKeys:read",
  });
  const hasProjectWriteAccess = useHasProjectAccess({
    projectId: entityId,
    scope: "apiKeys:CUD",
  });
  const hasOrganizationAccess = useHasOrganizationAccess({
    organizationId: entityId,
    scope: "organization:CRUD_apiKeys",
  });

  const hasAccess =
    scope === "project" ? hasProjectReadAccess : hasOrganizationAccess;
  const hasWriteAccess =
    scope === "project" ? hasProjectWriteAccess : hasOrganizationAccess;

  if (!hasAccess) {
    return (
      <div>
        <Header title="API Keys" />
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view API keys for this {scope}.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header
        title={startCase(`${scope} API keys`)}
        help={{
          description: `Learn more about ${scope} API keys`,
          href:
            scope === "project"
              ? "https://langfuse.com/docs/api#authentication"
              : "https://langfuse.com/docs/api#org-scoped-routes",
        }}
        actionButtons={
          hasWriteAccess ? (
            <CreateApiKeyButton entityId={entityId} scope={scope} />
          ) : undefined
        }
      />
      <CodeView
        content={envCode}
        title=".env"
        copiedToClipboardMessage="Secrets are not included, create a new key to copy them."
      />
      <ConnectedApiKeySettingsTable
        entityId={entityId}
        scope={scope}
        hasWriteAccess={hasWriteAccess}
      />
    </div>
  );
}
