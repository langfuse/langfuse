import { type PrismaClient } from "@langfuse/shared";

type CheckHasProtectedLabelsParams = {
  labelsToCheck: string[];
  projectId: string;
  prisma: PrismaClient;
};

export async function checkHasProtectedLabels(
  params: CheckHasProtectedLabelsParams,
): Promise<boolean> {
  const { labelsToCheck, projectId, prisma } = params;

  const protectedLabels = (
    await prisma.promptProtectedLabels.findMany({
      where: { projectId },
    })
  ).map((l) => l.label);

  const hasProtectedLabel = labelsToCheck.some((label) =>
    protectedLabels.includes(label),
  );

  return hasProtectedLabel;
}
