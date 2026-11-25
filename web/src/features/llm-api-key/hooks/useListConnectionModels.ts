import { useState } from "react";

import type { LlmConnectionFormOwner } from "@/src/features/public-api/components/CreateLLMApiKeyForm";
import { api, type RouterInputs } from "@/src/utils/api";

// What listing uses, plus the id the update procedures look the connection up by.
type ConnectionInput = Omit<
  RouterInputs["llmApiKey"]["listModels"],
  "projectId"
> & {
  id: string;
};

/**
 * Lists the models an OpenAI-compatible connection's endpoint serves, through
 * the project or organization router. In update mode the server fills in the
 * stored secret key and headers the form does not hold.
 */
export function useListConnectionModels(params: {
  owner: LlmConnectionFormOwner;
  mode: "create" | "update";
}) {
  const mutListModels = api.llmApiKey.listModels.useMutation();
  const mutListModelsUpdate = api.llmApiKey.listModelsUpdate.useMutation();
  const mutListOrganizationModels =
    api.organizationLlmApiKey.listModels.useMutation();
  const mutListOrganizationModelsUpdate =
    api.organizationLlmApiKey.listModelsUpdate.useMutation();
  const [error, setError] = useState<string | null>(null);

  const isPending =
    mutListModels.isPending ||
    mutListModelsUpdate.isPending ||
    mutListOrganizationModels.isPending ||
    mutListOrganizationModelsUpdate.isPending;

  /** Resolves to the model ids, or to null after recording the error. */
  async function listModels(
    connectionInput: ConnectionInput,
  ): Promise<string[] | null> {
    setError(null);
    const { id, adapter, secretKey, baseURL, extraHeaders } = connectionInput;
    // In update mode an empty key means the stored one.
    if (params.mode === "create" && !secretKey) {
      setError("Enter the API key to fetch models.");
      return null;
    }
    const listInput = { adapter, secretKey, baseURL, extraHeaders };

    try {
      let result;
      if (params.owner.scope === "project") {
        const owner = { projectId: params.owner.projectId };
        result =
          params.mode === "create"
            ? await mutListModels.mutateAsync({ ...listInput, ...owner })
            : await mutListModelsUpdate.mutateAsync({
                ...listInput,
                ...owner,
                id,
              });
      } else {
        const owner = { orgId: params.owner.organizationId };
        result =
          params.mode === "create"
            ? await mutListOrganizationModels.mutateAsync({
                ...listInput,
                ...owner,
              })
            : await mutListOrganizationModelsUpdate.mutateAsync({
                ...listInput,
                ...owner,
                id,
              });
      }

      if (!result.success) throw new Error(result.error);
      return result.models;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not fetch models.",
      );
      return null;
    }
  }

  return { listModels, isPending, error };
}
