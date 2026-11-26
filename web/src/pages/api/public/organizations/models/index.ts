import {
  getModelDefinition,
  listModelDefinitions,
  putOrganizationModelDefinitionByName,
} from "@/src/features/models/server/modelDefinitionService";
import { authenticateOrganizationApiRequest } from "@/src/features/public-api/server/authenticateOrganizationApiRequest";
import { withStablePublicApiMiddlewares } from "@/src/features/public-api/server/stablePublicApiRoute";
import {
  createStructuredPublicApiRequestValidationError,
  sendStructuredPublicApiErrorResponse,
  structuredPublicApiErrorContract,
} from "@/src/features/public-api/server/structuredPublicApiErrorContract";
import {
  GetOrganizationModelsV1Query,
  GetOrganizationModelsV1Response,
  PutOrganizationModelV1Body,
  PutOrganizationModelV1Response,
  toApiOrganizationModel,
} from "@/src/features/public-api/types/organization-models";
import { createStructuredPublicApiError } from "@/src/features/public-api/types/structuredPublicApiError";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";
import { prisma } from "@langfuse/shared/src/db";

export default withStablePublicApiMiddlewares({
  GET: async (req, res) => {
    const scope = await authenticateOrganizationApiRequest(
      req,
      res,
      "organizationModels:read",
      { errorContract: structuredPublicApiErrorContract },
    );
    if (!scope) return;

    const parsed = GetOrganizationModelsV1Query.safeParse(req.query);
    if (!parsed.success) {
      return sendStructuredPublicApiErrorResponse(
        res,
        createStructuredPublicApiRequestValidationError({
          error: parsed.error,
          requestPart: "query",
        }),
      );
    }
    const { scope: modelScope, search, page, limit } = parsed.data;
    const { models, totalCount } = await listModelDefinitions({
      owner: { type: "organization", organizationId: scope.orgId },
      searchString: search ?? "",
      scopes: modelScope === "ALL" ? undefined : [modelScope],
      page,
      limit,
    });

    return res.status(200).json(
      GetOrganizationModelsV1Response.parse({
        data: models.map(toApiOrganizationModel),
        meta: {
          page,
          limit,
          totalItems: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      }),
    );
  },

  PUT: async (req, res) => {
    const scope = await authenticateOrganizationApiRequest(
      req,
      res,
      "organizationModels:CUD",
      { errorContract: structuredPublicApiErrorContract },
    );
    if (!scope) return;

    const parsed = PutOrganizationModelV1Body.safeParse(req.body);
    if (!parsed.success) {
      return sendStructuredPublicApiErrorResponse(
        res,
        createStructuredPublicApiRequestValidationError({
          error: parsed.error,
          requestPart: "body",
        }),
      );
    }

    if (!(await isValidPostgresRegex(parsed.data.matchPattern, prisma))) {
      return sendStructuredPublicApiErrorResponse(
        res,
        createStructuredPublicApiError({
          httpCode: 400,
          code: "invalid_body",
          message: "Invalid regex, needs to be Postgres syntax",
          details: { field: "matchPattern" },
        }),
      );
    }

    const result = await putOrganizationModelDefinitionByName({
      organizationId: scope.orgId,
      actor: { apiKeyId: scope.apiKeyId, orgId: scope.orgId },
      input: parsed.data,
    });

    const model = await getModelDefinition({
      owner: { type: "organization", organizationId: scope.orgId },
      modelId: result.model.id,
    });
    return res
      .status(result.created ? 201 : 200)
      .json(
        PutOrganizationModelV1Response.parse(toApiOrganizationModel(model)),
      );
  },
});
