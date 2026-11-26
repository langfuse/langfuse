import { listModelDefinitions } from "@/src/features/models/server/modelDefinitionService";
import {
  type GetOrganizationModelsV1Query,
  toApiOrganizationModel,
} from "@/src/features/public-api/types/organization-models";
import type { z } from "zod";

export const listOrganizationModelsForApi = async ({
  organizationId,
  scope,
  search,
  page,
  limit,
}: z.infer<typeof GetOrganizationModelsV1Query> & {
  organizationId: string;
}) => {
  const { models, totalCount } = await listModelDefinitions({
    owner: { type: "organization", organizationId },
    searchString: search ?? "",
    scopes: scope === "ALL" ? undefined : [scope],
    // The public API counts pages from 1, the service from 0.
    page: page - 1,
    limit,
  });

  return {
    data: models.map(toApiOrganizationModel),
    meta: {
      page,
      limit,
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
};
