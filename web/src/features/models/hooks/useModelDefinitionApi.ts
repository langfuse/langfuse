import { type ModelOwner } from "@/src/features/models/modelOwner";
import {
  type TestModelMatchInput,
  type UpsertModelRequest,
} from "@/src/features/models/validation";
import { api } from "@/src/utils/api";

/**
 * Saving resolves without waiting for the refetch. Project lists include
 * organization models, so organization writes invalidate them too.
 */
function useInvalidateModelLists() {
  const utils = api.useUtils();
  return {
    onProjectSuccess: () => {
      utils.models.invalidate();
    },
    onOrganizationSuccess: () => {
      utils.organizationModels.invalidate();
      utils.models.invalidate();
    },
  };
}

/**
 * The project and organization routers share one shape, so both mutations are
 * mounted and the owner picks one; the unused one never fires.
 */
export function useUpsertModelDefinition(owner: ModelOwner) {
  const { onProjectSuccess, onOrganizationSuccess } = useInvalidateModelLists();
  const projectMutation = api.models.upsert.useMutation({
    onSuccess: onProjectSuccess,
  });
  const organizationMutation = api.organizationModels.upsert.useMutation({
    onSuccess: onOrganizationSuccess,
  });

  return {
    upsert: (input: UpsertModelRequest) =>
      owner.scope === "project"
        ? projectMutation.mutateAsync({ ...input, projectId: owner.projectId })
        : organizationMutation.mutateAsync({
            ...input,
            orgId: owner.organizationId,
          }),
    isPending: projectMutation.isPending || organizationMutation.isPending,
  };
}

export function useDeleteModelDefinition(owner: ModelOwner) {
  const { onProjectSuccess, onOrganizationSuccess } = useInvalidateModelLists();
  const projectMutation = api.models.delete.useMutation({
    onSuccess: onProjectSuccess,
  });
  const organizationMutation = api.organizationModels.delete.useMutation({
    onSuccess: onOrganizationSuccess,
  });
  const active =
    owner.scope === "project" ? projectMutation : organizationMutation;

  return {
    remove: (modelId: string) =>
      owner.scope === "project"
        ? projectMutation.mutateAsync({ projectId: owner.projectId, modelId })
        : organizationMutation.mutateAsync({
            orgId: owner.organizationId,
            modelId,
          }),
    isPending: active.isPending,
    error: active.error?.message,
    reset: active.reset,
  };
}

const listQueryOptions = {
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  refetchOnReconnect: false,
  staleTime: 1000 * 60 * 10,
} as const;

export function useModelDefinitionList(
  owner: ModelOwner,
  params: { page: number; limit: number; searchString: string },
) {
  const projectQuery = api.models.getAll.useQuery(
    {
      ...params,
      projectId: owner.scope === "project" ? owner.projectId : "",
    },
    { ...listQueryOptions, enabled: owner.scope === "project" },
  );
  const organizationQuery = api.organizationModels.getAll.useQuery(
    {
      ...params,
      orgId: owner.scope === "organization" ? owner.organizationId : "",
    },
    { ...listQueryOptions, enabled: owner.scope === "organization" },
  );
  return owner.scope === "project" ? projectQuery : organizationQuery;
}

/** Last use comes from a project's generations, so organizations have none. */
export function useModelLastUsed(owner: ModelOwner, modelIds: string[]) {
  return api.models.lastUsedByModelIds.useQuery(
    {
      projectId: owner.scope === "project" ? owner.projectId : "",
      modelIds,
    },
    {
      ...listQueryOptions,
      enabled: owner.scope === "project" && modelIds.length > 0,
    },
  );
}

export function useModelDefinition(owner: ModelOwner, modelId: string) {
  const projectQuery = api.models.getById.useQuery(
    {
      projectId: owner.scope === "project" ? owner.projectId : "",
      modelId,
    },
    { enabled: owner.scope === "project" && !!owner.projectId && !!modelId },
  );
  const organizationQuery = api.organizationModels.getById.useQuery(
    {
      orgId: owner.scope === "organization" ? owner.organizationId : "",
      modelId,
    },
    {
      enabled:
        owner.scope === "organization" && !!owner.organizationId && !!modelId,
    },
  );
  return owner.scope === "project" ? projectQuery : organizationQuery;
}

/** Runs only on `refetch()`; the dialog submits explicitly. */
export function useTestModelMatch(
  owner: ModelOwner,
  input: TestModelMatchInput,
) {
  const projectQuery = api.models.testMatch.useQuery(
    {
      ...input,
      projectId: owner.scope === "project" ? owner.projectId : "",
    },
    { enabled: false },
  );
  const organizationQuery = api.organizationModels.testMatch.useQuery(
    {
      ...input,
      orgId: owner.scope === "organization" ? owner.organizationId : "",
    },
    { enabled: false },
  );
  return owner.scope === "project" ? projectQuery : organizationQuery;
}
