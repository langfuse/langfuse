import { EvalTemplateType, type Prisma } from "@langfuse/shared/src/db";

export async function findDefaultModelEvalTemplateIds({
  tx,
  projectId,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
}) {
  const evalTemplates = await tx.evalTemplate.findMany({
    where: {
      OR: [{ projectId }, { projectId: null }],
      provider: null,
      model: null,
      type: EvalTemplateType.LLM_AS_JUDGE,
    },
    select: {
      id: true,
    },
  });

  return evalTemplates.map((template) => template.id);
}
