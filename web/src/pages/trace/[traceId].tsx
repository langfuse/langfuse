import { ErrorPage } from "@/src/components/error-page";
import { getTracesByIdsForAnyProject } from "@langfuse/shared/src/server";
import { type GetServerSideProps } from "next";
import { useRouter } from "next/router";

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

  if (!traces || traces.length === 0 || traces.length > 1) {
    return {
      props: {
        notFound: true,
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

const TraceRedirectPage = ({ notFound }: { notFound?: boolean }) => {
  const router = useRouter();
  if (router.isFallback) {
    return <div>Loading...</div>;
  }

  if (notFound) {
    return (
      <ErrorPage message="Trace not found. Please upgrade the SDK as we changed the URL schema." />
    );
  }

  return null;
};

export default TraceRedirectPage;
