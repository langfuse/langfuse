import {
  listModelDefinitions,
  putOrganizationModelDefinitionByName,
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
  GetOrganizationModelsV1Query,
  GetOrganizationModelsV1Response,
  PutOrganizationModelV1Body,
  PutOrganizationModelV1Response,
  toApiOrganizationModel,
} from "@/src/features/public-api/types/organization-models";
import { createStructuredPublicApiError } from "@/src/features/public-api/types/structuredPublicApiError";
import { InvalidRequestError } from "@langfuse/shared";

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
    const query = parsed.data;

    const { models, totalCount } = await listModelDefinitions({
      owner: { type: "organization", organizationId: scope.orgId },
      searchString: query.search ?? "",
      scopes: query.scope === "ALL" ? undefined : [query.scope],
      page: query.page - 1,
      limit: query.limit,
    });

    return res.status(200).json(
      GetOrganizationModelsV1Response.parse({
        data: models.map(toApiOrganizationModel),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: totalCount,
          totalPages: Math.ceil(totalCount / query.limit),
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

    const owner = {
      type: "organization",
      organizationId: scope.orgId,
    } as const;
    let result: Awaited<
      ReturnType<typeof putOrganizationModelDefinitionByName>
    >;
    try {
      result = await putOrganizationModelDefinitionByName({
        organizationId: scope.orgId,
        actor: { apiKeyId: scope.apiKeyId, orgId: scope.orgId },
        input: parsed.data,
      });
    } catch (error) {
      // The only request error left after schema validation is a match
      // pattern that Postgres cannot compile.
      if (error instanceof InvalidRequestError) {
        throw createStructuredPublicApiError({
          httpCode: 400,
          code: "invalid_body",
          message: error.message,
          details: { field: "matchPattern" },
        });
      }
      throw error;
    }

    const model = await getModelDefinition({
      owner,
      modelId: result.model.id,
    });
    return res
      .status(result.created ? 201 : 200)
      .json(
        PutOrganizationModelV1Response.parse(toApiOrganizationModel(model)),
      );
  },
});
