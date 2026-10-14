import { prisma } from "@langfuse/shared/src/db";
import { type GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (!context.params) {
    return {
      notFound: true,
    };
  }

  const projectId = context.params.projectId as string;
  const evaluatorId = context.params.configId as string;

  const evaluator = await prisma.evaluationRule.findUnique({
    where: {
      id: evaluatorId,
      projectId,
    },
    select: {
      project: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!evaluator) {
    return {
      notFound: true,
    };
  }

  return {
    redirect: {
      destination: `/project/${projectId}/evals/legacy/${evaluatorId}`,
      permanent: false,
    },
  };
};
