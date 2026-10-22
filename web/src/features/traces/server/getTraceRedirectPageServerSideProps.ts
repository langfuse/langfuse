import { getTracesByIdsForAnyProject } from "@langfuse/shared/src/server";
import { type GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (!context.params) {
    return {
      props: {
        notFound: true,
      },
    };
  }

  const traceId = context.params.traceId as string;

  const traces = await getTracesByIdsForAnyProject([traceId]);

  if (!traces || traces.length === 0) {
    return {
      props: {
        notFound: true,
      },
    };
  }

  if (traces.length > 1) {
    return {
      props: {
        duplicatesFound: true,
      },
    };
  }

  return {
    redirect: {
      destination: `/project/${traces[0].projectId}/traces/${traceId}`,
      permanent: false,
    },
  };
};
