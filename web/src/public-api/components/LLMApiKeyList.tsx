import { useMemo } from "react";
import { Building2, Plug } from "lucide-react";

import { useHasProjectAccess } from "@/src/identity/access-control";
import { Alert } from "@/src/app/design-system/Alert/Alert";
import { InfoTooltip } from "@/src/app/design-system/legacy-primitives/InfoTooltip/InfoTooltip";
import Header from "@/src/app/shell/layouts/header";
import { LlmConnectionEmptyState } from "@/src/public-api/components/LlmConnectionEmptyState/LlmConnectionEmptyState";
import { ConnectedLLMApiKeySettingsTable } from "./LLMApiKeySettingsTable/ConnectedLLMApiKeySettingsTable";
import { type LLMApiKeySettingsTableRow } from "./LLMApiKeySettingsTable/LLMApiKeySettingsTable";
import type { AsyncTableData } from "@/src/app/design-system/table/Table";
import { api } from "@/src/app/utils/api";

export function LlmApiKeyList(props: {
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
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
      <Alert>
        <Alert.Title>Access Denied</Alert.Title>
        <Alert.Description>
          You do not have permission to view LLM API keys for this project.
        </Alert.Description>
      </Alert>
    );
  }

  return (
    <div id="llm-api-keys">
      <section>
        <ConnectedLLMApiKeySettingsTable
          owner={{
            scope: "organization",
            organizationId: props.organizationId,
          }}
          data={organizationTableData}
          emptyState={
            <LlmConnectionEmptyState
              icon={Building2}
              title="No organization connections"
              description={`Organization connections are shared with every project in ${props.organizationName}.`}
            />
          }
          toolbarContent={
            <div className="flex items-center gap-1">
              <Header title="Organization connections" className="mb-0!" />
              <InfoTooltip label="About organization connections">
                Organization connections are inherited by this project. Project
                connections with the same provider name take precedence.
              </InfoTooltip>
            </div>
          }
        />
      </section>
      <section className="mt-6">
        <ConnectedLLMApiKeySettingsTable
          owner={{ scope: "project", projectId: props.projectId }}
          overriddenProviders={organizationProviders}
          emptyState={
            <LlmConnectionEmptyState
              icon={Plug}
              title="No project connections"
              description={`Project connections are only available in ${props.projectName} and take precedence over organization connections with the same provider.`}
            />
          }
          toolbarContent={
            <Header title="Project connections" className="mb-0!" />
          }
        />
      </section>
    </div>
  );
}
