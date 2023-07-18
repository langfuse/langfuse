import { type ApiAccessScope } from "@/src/features/publicApi/server/types";
import { prisma } from "@/src/server/db";

type Resource = {
  type: "project" | "trace" | "observation" | "score" | "neuron";
  id: string;
};

export async function checkApiAccessScope(
  scope: ApiAccessScope,
  resources: Resource[],
  action?: "score"
): Promise<boolean> {
  // ACCESS LEVEL
  // If the access level is "scores", the only action allowed is "score"
  if (scope.accessLevel === "scores" && action !== "score") return false;

  // RESOURCE within project of scope
  // If the resource is a project, it must match the project of the scope
  const checks = await Promise.all(
    resources.map((resource) => isResourceInProject(resource, scope.projectId))
  );
  return checks.every((result) => result);
}

async function isResourceInProject(resource: Resource, projectId: string) {
  switch (resource.type) {
    case "project":
      return resource.id === projectId;
    case "trace":
      return (
        (await prisma.trace.count({
          where: { id: resource.id, projectId },
        })) === 1
      );
    case "observation":
      return (
        (await prisma.observation.count({
          where: { id: resource.id, trace: { projectId } },
        })) === 1
      );
    case "score":
      return (
        (await prisma.score.count({
          where: {
            id: resource.id,
            trace: { projectId },
          },
        })) === 1
      );
    default:
      return false;
  }
}
