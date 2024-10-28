import { prisma } from "@langfuse/shared/src/db";
import { type GetServerSideProps } from "next";
import { useRouter } from "next/router";

// This url is deprecated, we keep this redirect page for backward compatibility
export const getServerSideProps: GetServerSideProps = async (context) => {
  const { projectId } = context.params as { projectId: string };
  if (!context.params) {
    return {
      notFound: true,
    };
  }

  const evaluatorId = context.params.configId as string;

  const evaluator = await prisma.jobConfiguration.findUnique({
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
      destination: `/project/${projectId}/evals/${evaluatorId}`,
      permanent: false,
    },
  };
};

export default function RedirectPage() {
  const router = useRouter();
  if (router.isFallback) {
    return <div>Loading...</div>;
  }

  return <div>Redirecting...</div>;
}
