import { type ApiAccessScope } from "@/src/features/publicApi/server/types";
import { prisma } from "@/src/server/db";

type Resource = {
  type: "project" | "trace" | "observation" | "score";
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
      const checkProject = resource.id === projectId;
      if (!checkProject)
        return console.log(
          `Project ressource denied ${resource.id}, ${projectId}`
        );
      return checkProject;
    case "trace":
      const checkTrace =
        (await prisma.trace.count({
          where: { id: resource.id, projectId },
        })) === 1;
      if (!checkTrace)
        console.log(`Trace ressource denied ${resource.id} ${projectId}`);

      return checkTrace;
    case "observation":
      const observationCheck =
        (await prisma.observation.count({
          where: { id: resource.id, trace: { projectId } },
        })) === 1;
      if (!observationCheck)
        console.log(`Observation ressource denied ${resource.id} ${projectId}`);
      return observationCheck;
    case "score":
      const scoreCheck =
        (await prisma.score.count({
          where: {
            id: resource.id,
            trace: { projectId },
          },
        })) === 1;
      if (!scoreCheck)
        console.log(`Score ressource denied ${resource.id} ${projectId}`);
      return scoreCheck;
    default:
      return false;
  }
}
