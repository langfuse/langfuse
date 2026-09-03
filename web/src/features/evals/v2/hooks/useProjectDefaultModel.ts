import { showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useState } from "react";
import { supportedModels } from "@langfuse/shared";

import { env } from "@/src/env.mjs";
import { getJudgeModelProviderAdapters } from "@/src/features/evals/v2/judgeModel";
import type { ProjectDefaultModelConfig } from "@/src/features/evals/v2/types/ProjectDefaultModelConfig";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

function isSameJudgeModel(
  first: Pick<ProjectDefaultModelConfig, "provider" | "model"> | null,
  second: Pick<ProjectDefaultModelConfig, "provider" | "model"> | null,
) {
  return first?.provider === second?.provider && first?.model === second?.model;
}

export function useProjectDefaultModel({
  projectId,
  source,
}: {
  projectId: string;
  source: "editor" | "overview";
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [pendingModel, setPendingModel] =
    useState<ProjectDefaultModelConfig | null>(null);
  const canRead = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:read",
  });
  const canUpdate = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:CUD",
  });
  const defaultModelQuery = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
    { enabled: Boolean(projectId) && canRead },
  );
  const canReadConnections = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:read",
  });
  const connectionsQuery = api.llmApiKey.all.useQuery(
    { projectId },
    // Gated on the scope the router enforces, so a viewer does not fire a
    // request that can only come back 403.
    { enabled: Boolean(projectId) && canReadConnections },
  );
  const defaultModel = defaultModelQuery.data ?? null;
  const connections = connectionsQuery.data?.data ?? [];
  const upsertDefaultModel = api.defaultLlmModel.upsertDefaultModel.useMutation(
    {
      onError: trpcErrorToast,
    },
  );

  const updateDefaultModel = (
    model: ProjectDefaultModelConfig,
    isReplacement: boolean,
  ) => {
    upsertDefaultModel.mutate(
      { projectId, ...model },
      {
        onSuccess: async () => {
          await Promise.all([
            utils.defaultLlmModel.fetchDefaultModel.invalidate({ projectId }),
            utils.evalsV2.list.invalidate({ projectId }),
            utils.evalsV2.options.invalidate({ projectId }),
            utils.evalsV2.filterOptions.invalidate({ projectId }),
          ]);
          capture("evaluators:default_model_update", {
            source,
            isReplacement,
          });
          showSuccessToast({
            title: "Project default model updated",
            description: `${model.provider} / ${model.model} is now the project default.`,
          });
          setPendingModel(null);
        },
      },
    );
  };

  const requestUpdate = (model: ProjectDefaultModelConfig) => {
    if (isSameJudgeModel(defaultModel, model)) return;

    if (defaultModel) {
      setPendingModel(model);
      return;
    }

    updateDefaultModel(model, false);
  };

  return {
    defaultModel,
    connections,
    connectionsPending: connectionsQuery.isPending,
    providerGroups: connections.map<[string, string[]]>((connection) => [
      connection.provider,
      Array.from(
        new Set([
          ...connection.customModels,
          ...(connection.withDefaultModels
            ? supportedModels[connection.adapter]
            : []),
        ]),
      ),
    ]),
    providerAdapters: getJudgeModelProviderAdapters(connections),
    canRead,
    canUpdate,
    update: {
      pendingModel,
      isPending: upsertDefaultModel.isPending,
      requestUpdate,
      updateConfiguration: (model: ProjectDefaultModelConfig) =>
        updateDefaultModel(model, defaultModel !== null),
      dismissConfirmation: () => setPendingModel(null),
      confirmUpdate: () => {
        if (pendingModel) updateDefaultModel(pendingModel, true);
      },
    },
    openProviderSettings: () => {
      window.open(
        `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/project/${projectId}/settings/llm-connections`,
        "_blank",
        "noopener,noreferrer",
      );
      window.addEventListener("focus", () => connectionsQuery.refetch(), {
        once: true,
      });
    },
  };
}
