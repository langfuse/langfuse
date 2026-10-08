import { useMemo } from "react";

import { useHasProjectAccess } from "@/src/features/rbac";
import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { ConnectedLLMApiKeySettingsTable } from "./LLMApiKeySettingsTable/ConnectedLLMApiKeySettingsTable";
import { type LLMApiKeySettingsTableRow } from "./LLMApiKeySettingsTable/LLMApiKeySettingsTable";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { api } from "@/src/utils/api";

export function LlmApiKeyList(props: {
  organizationId: string;
  projectId: string;
}) {
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "llmApiKeys:read",
  });
  const inherited = api.llmApiKey.inherited.useQuery(
    {
      projectId: props.projectId,
      includeDecisionModels: true,
    },
    { enabled: hasAccess },
  );
  const organizationTableData = useMemo<
    AsyncTableData<LLMApiKeySettingsTableRow[]>
  >(() => {
    if (inherited.isLoading) return { status: "loading" };
    if (inherited.isError) {
      return {
        status: "error",
        error: "Failed to load organization connections",
      };
    }
    return {
      status: "success",
      data: (inherited.data ?? []).map((apiKey) => ({
        ...apiKey,
        overriddenByProject: undefined,
      })),
    };
  }, [inherited.data, inherited.isError, inherited.isLoading]);
  const organizationProviders = useMemo(
    () => new Set((inherited.data ?? []).map((apiKey) => apiKey.provider)),
    [inherited.data],
  );

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
      <section>
        <div className="mb-2 flex items-center gap-1">
          <h3 className="text-base">Organization connections</h3>
          <InfoTooltip label="About organization connections">
            Organization connections are inherited by this project. Project
            connections with the same provider name take precedence.
          </InfoTooltip>
        </div>
        <ConnectedLLMApiKeySettingsTable
          owner={{
            scope: "organization",
            organizationId: props.organizationId,
          }}
          data={organizationTableData}
        />
      </section>
      <h3 className="mt-6 mb-2 text-base">Project connections</h3>
      <ConnectedLLMApiKeySettingsTable
        owner={{ scope: "project", projectId: props.projectId }}
        overriddenProviders={organizationProviders}
      />
    </div>
  );
}
