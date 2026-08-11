import {
  ForbiddenError,
  InvalidRequestError,
  UnauthorizedError,
} from "@langfuse/shared";
import { z } from "zod";
import { getProjectMemberNames } from "@/src/features/rbac/server/getProjectMemberNames";
import { ProjectMemberNamesResponse } from "@/src/features/rbac/types/project-member-names";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { getServerAuthSession } from "@/src/server/auth";

const querySchema = z.object({
  projectId: z.string().min(1),
});

export default withMiddlewares({
  GET: async (req, res) => {
    const query = querySchema.safeParse(req.query);
    if (!query.success) {
      throw new InvalidRequestError("Invalid project id");
    }

    const session = await getServerAuthSession({ req, res });
    if (!session?.user) {
      throw new UnauthorizedError("Unauthorized");
    }

    const projectOrganization = session.user.organizations.find(
      (organization) =>
        organization.projects.some(
          (project) => project.id === query.data.projectId,
        ),
    );
    if (!projectOrganization) {
      throw new ForbiddenError("Project access required");
    }

    const members = await getProjectMemberNames({
      projectId: query.data.projectId,
      orgId: projectOrganization.id,
    });
    const response = ProjectMemberNamesResponse.parse({ members });

    return res.status(200).json(response);
  },
});
