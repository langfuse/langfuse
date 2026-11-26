import {
  deleteModelDefinition,
  getModelDefinition,
} from "@/src/features/models/server/modelDefinitionService";
import { authenticateOrganizationApiRequest } from "@/src/features/public-api/server/authenticateOrganizationApiRequest";
import { withStablePublicApiMiddlewares } from "@/src/features/public-api/server/stablePublicApiRoute";
import {
  createStructuredPublicApiRequestValidationError,
  sendStructuredPublicApiErrorResponse,
  structuredPublicApiErrorContract,
} from "@/src/features/public-api/server/structuredPublicApiErrorContract";
import {
  DeleteOrganizationModelV1Response,
  GetOrganizationModelV1Response,
  OrganizationModelV1Query,
  toApiOrganizationModel,
} from "@/src/features/public-api/types/organization-models";
import { ForbiddenError } from "@langfuse/shared";
import type { NextApiRequest, NextApiResponse } from "next";

function parseQuery(req: NextApiRequest, res: NextApiResponse) {
  const parsed = OrganizationModelV1Query.safeParse(req.query);
  if (parsed.success) return parsed.data;
  sendStructuredPublicApiErrorResponse(
    res,
    createStructuredPublicApiRequestValidationError({
      error: parsed.error,
      requestPart: "query",
    }),
  );
  return null;
}

export default withStablePublicApiMiddlewares({
  GET: async (req, res) => {
    const scope = await authenticateOrganizationApiRequest(
      req,
      res,
      "organizationModels:read",
      { errorContract: structuredPublicApiErrorContract },
    );
    if (!scope) return;
    const query = parseQuery(req, res);
    if (!query) return;

    const model = await getModelDefinition({
      owner: { type: "organization", organizationId: scope.orgId },
      modelId: query.id,
    });
    return res
      .status(200)
      .json(
        GetOrganizationModelV1Response.parse(toApiOrganizationModel(model)),
      );
  },

  DELETE: async (req, res) => {
    const scope = await authenticateOrganizationApiRequest(
      req,
      res,
      "organizationModels:CUD",
      { errorContract: structuredPublicApiErrorContract },
    );
    if (!scope) return;
    const query = parseQuery(req, res);
    if (!query) return;

    const owner = {
      type: "organization",
      organizationId: scope.orgId,
    } as const;
    const model = await getModelDefinition({ owner, modelId: query.id });
    if (model.scope === "LANGFUSE") {
      throw new ForbiddenError(
        "Models managed by Langfuse cannot be deleted. To override this model, create an organization model with the same modelName.",
      );
    }

    await deleteModelDefinition({
      owner,
      actor: { apiKeyId: scope.apiKeyId, orgId: scope.orgId },
      modelId: model.id,
    });

    return res.status(200).json(
      DeleteOrganizationModelV1Response.parse({
        message: "Model successfully deleted",
      }),
    );
  },
});
