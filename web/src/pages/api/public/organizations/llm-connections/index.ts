import { LlmConnectionService } from "@/src/features/llm-api-key/server/llmConnectionService";
import { authenticateOrganizationLlmConnectionApiRequest } from "@/src/features/public-api/server/authenticateOrganizationApiRequest";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetLlmConnectionsV1Query,
  GetLlmConnectionsV1Response,
  PutLlmConnectionV1Body,
  PutLlmConnectionV1Response,
  transformDbLlmConnectionToAPI,
} from "@/src/features/public-api/types/llm-connections";

export default withMiddlewares({
  GET: async (req, res) => {
    const scope = await authenticateOrganizationLlmConnectionApiRequest(
      req,
      res,
      "organizationLlmApiKeys:read",
    );
    if (!scope) return;

    const query = GetLlmConnectionsV1Query.parse(req.query);
    const result = await new LlmConnectionService().list({
      owner: { type: "organization", organizationId: scope.orgId },
      page: query.page,
      limit: query.limit,
    });
    return res.status(200).json(
      GetLlmConnectionsV1Response.parse({
        data: result.data.map(transformDbLlmConnectionToAPI),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: result.totalCount,
          totalPages: Math.ceil(result.totalCount / query.limit),
        },
      }),
    );
  },

  PUT: async (req, res) => {
    const scope = await authenticateOrganizationLlmConnectionApiRequest(
      req,
      res,
      "organizationLlmApiKeys:CUD",
    );
    if (!scope) return;

    const input = PutLlmConnectionV1Body.parse(req.body);
    const result = await new LlmConnectionService().upsert({
      owner: { type: "organization", organizationId: scope.orgId },
      input,
      actor: {
        apiKeyId: scope.apiKeyId,
        orgId: scope.orgId,
      },
    });

    return res
      .status(result.created ? 201 : 200)
      .json(
        PutLlmConnectionV1Response.parse(
          transformDbLlmConnectionToAPI(result.connection),
        ),
      );
  },
});
