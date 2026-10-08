import { LlmConnectionService } from "@/src/features/llm-api-key/server/llmConnectionService";
import { authenticateOrganizationLlmConnectionApiRequest } from "@/src/features/public-api/server/authenticateOrganizationApiRequest";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  DeleteLlmConnectionV1Query,
  DeleteLlmConnectionV1Response,
} from "@/src/features/public-api/types/llm-connections";

export default withMiddlewares({
  DELETE: async (req, res) => {
    const scope = await authenticateOrganizationLlmConnectionApiRequest(
      req,
      res,
      "organizationLlmApiKeys:CUD",
    );
    if (!scope) return;

    const query = DeleteLlmConnectionV1Query.parse(req.query);
    await new LlmConnectionService().delete({
      owner: { type: "organization", organizationId: scope.orgId },
      id: query.id,
      actor: {
        apiKeyId: scope.apiKeyId,
        orgId: scope.orgId,
      },
    });

    return res.status(200).json(
      DeleteLlmConnectionV1Response.parse({
        message: "LLM connection successfully deleted",
      }),
    );
  },
});
