import { useMemo } from "react";

import { useHasProjectAccess } from "@/src/features/rbac";
import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { ConnectedLLMApiKeySettingsTable } from "./LLMApiKeySettingsTable/ConnectedLLMApiKeySettingsTable";
import {
  LLMApiKeySettingsTable,
  type LLMApiKeySettingsTableRow,
} from "./LLMApiKeySettingsTable/LLMApiKeySettingsTable";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { api } from "@/src/utils/api";

export function LlmApiKeyList(props: { projectId: string }) {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "llmApiKeys:read",
  });
  if (!hasAccess) {
    return (
      <div>
        <Header title="LLM Connections" />
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view LLM API keys for this project.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <div id="llm-api-keys">
      <Header title="LLM Connections" />
      <p className="mb-4 text-sm">
        Connect your LLM services to enable evaluations and playground features.
        Your provider will charge based on usage.
      </p>
      <InheritedLlmConnections projectId={props.projectId} />
      <h3 className="mt-6 mb-2 text-base">Project connections</h3>
      <ConnectedLLMApiKeySettingsTable
        owner={{ scope: "project", projectId: props.projectId }}
      />
    </div>
  );
}

function InheritedLlmConnections({ projectId }: { projectId: string }) {
  const inherited = api.llmApiKey.inherited.useQuery({
    projectId,
    includeDecisionModels: true,
  });
  const tableData = useMemo<AsyncTableData<LLMApiKeySettingsTableRow[]>>(() => {
    if (inherited.isLoading) return { status: "loading" };
    if (inherited.isError) {
      return {
        status: "error",
        error: "Failed to load organization connections",
      };
    }
    return { status: "success", data: inherited.data ?? [] };
  }, [inherited.data, inherited.isError, inherited.isLoading]);

  return (
    <section>
      <h3 className="mb-2 text-base">Organization connections</h3>
      <p className="text-muted-foreground mb-3 text-sm">
        These connections are managed in organization settings and inherited by
        this project. A project connection with the same provider takes
        precedence.
      </p>
      <LLMApiKeySettingsTable
        createAction={{ hasAccess: false, onClick: () => undefined }}
        deleteAction={{ hasAccess: false, onClick: () => undefined }}
        updateAction={{ hasAccess: false, onClick: () => undefined }}
        data={tableData}
        noResultsMessage="No organization connections"
      />
    </section>
  );
}
