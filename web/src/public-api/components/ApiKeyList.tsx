import startCase from "lodash/startCase";

import { Alert } from "@/src/app/design-system/Alert/Alert";
import { CodeSection } from "@/src/app/design-system/CodeSection/CodeSection";
import Header from "@/src/app/shell/layouts/header";
import { CreateApiKeyButton } from "@/src/public-api/components/CreateApiKeyButton";
import { ConnectedApiKeySettingsTable } from "@/src/public-api/components/ApiKeySettingsTable/ConnectedApiKeySettingsTable";
import { useLangfuseEnvCode } from "@/src/public-api/hooks/useLangfuseEnvCode";
import {
  useHasOrganizationAccess,
  useHasProjectAccess,
} from "@/src/identity/access-control";

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
      <CodeSection
        title=".env"
        variant="outline"
        copiedMessage="Secrets are not included, create a new key to copy them."
        content={envCode}
      />
      <ConnectedApiKeySettingsTable
        entityId={entityId}
        scope={scope}
        hasWriteAccess={hasWriteAccess}
      />
    </div>
  );
}
