import { type PrismaClient } from "@langfuse/shared";

type CheckHasProtectedLabelsParams = {
  labelsToCheck: string[];
  projectId: string;
  prisma: PrismaClient;
};

export async function checkHasProtectedLabels(
  params: CheckHasProtectedLabelsParams,
): Promise<{ hasProtectedLabels: boolean; protectedLabels: string[] }> {
  const { labelsToCheck, projectId, prisma } = params;

  const protectedLabels = (
    await prisma.promptProtectedLabels.findMany({
      where: { projectId },
    })
  ).map((l) => l.label);

  const hasProtectedLabels = labelsToCheck.some((label) =>
    protectedLabels.includes(label),
  );

  return { hasProtectedLabels, protectedLabels };
}
