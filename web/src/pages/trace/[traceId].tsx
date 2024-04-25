import { prisma } from "@langfuse/shared/src/db";
import { type GetServerSideProps } from "next";
import { useRouter } from "next/router";

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (!context.params) {
    return {
      notFound: true,
    };
  }

  const traceId = context.params.traceId as string;

  const trace = await prisma.trace.findUnique({
    where: {
      id: traceId,
    },
    select: {
      project: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!trace) {
    return {
      notFound: true,
    };
  }

  return {
    redirect: {
      destination: `/project/${trace.project.id}/traces/${traceId}`,
      permanent: false,
    },
  };
};

const TraceRedirectPage = () => {
  const router = useRouter();
  if (router.isFallback) {
    return <div>Loading...</div>;
  }

  return <div>Redirecting...</div>;
};

export default TraceRedirectPage;
