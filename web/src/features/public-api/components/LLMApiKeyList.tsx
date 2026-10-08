import { useMemo } from "react";

import { useHasProjectAccess } from "@/src/features/rbac";
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
          toolbarContent={
            <div className="flex items-center gap-1">
              <h3 className="text-base font-semibold">
                Organization connections
              </h3>
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
          toolbarContent={
            <h3 className="text-base font-semibold">Project connections</h3>
          }
        />
      </section>
    </div>
  );
}
