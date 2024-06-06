import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { prisma } from "@langfuse/shared/src/db";

type Resource = {
  type: "project" | "trace" | "observation" | "score";
  id: string;
};

export async function checkApiAccessScope(
  scope: ApiAccessScope,
  resources: Resource[],
  action?: "score",
): Promise<boolean> {
  // ACCESS LEVEL
  // If the access level is "scores", the only action allowed is "score"
  if (scope.accessLevel === "scores" && action !== "score") return false;

  // RESOURCE within project of scope
  // If the resource is a project, it must match the project of the scope
  const checks = await Promise.all(
    resources.map((resource) => isResourceInProject(resource, scope.projectId)),
  );
  return checks.every((result) => result);
}

async function isResourceInProject(resource: Resource, projectId: string) {
  switch (resource.type) {
    case "project":
      const projectCheck = resource.id === projectId;
      if (!projectCheck)
        console.log("project check", projectCheck, resource.id, projectId);
      return projectCheck;

    case "trace":
      const traceCheck =
        (await prisma.trace.count({
          where: { id: resource.id, projectId },
        })) === 1;
      if (!traceCheck)
        console.log("trace check", traceCheck, resource.id, projectId);
      return traceCheck;

    case "observation":
      const observationCheck =
        (await prisma.observation.count({
          where: { id: resource.id, projectId },
        })) === 1;
      if (!observationCheck)
        console.log(
          "observation check",
          observationCheck,
          resource.id,
          projectId,
        );
      return observationCheck;

    case "score":
      const scoreCheck =
        (await prisma.score.count({
          where: {
            id: resource.id,
            projectId,
          },
        })) === 1;
      if (!scoreCheck)
        console.log("score check", scoreCheck, resource.id, projectId);
      return scoreCheck;
    default:
      return false;
  }
}
