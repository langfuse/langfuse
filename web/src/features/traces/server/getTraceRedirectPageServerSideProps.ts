import { hasProjectAccess } from "@/src/features/rbac";
import { getServerAuthSession } from "@/src/server/auth";
import { getTracesByIdsForAnyProject } from "@langfuse/shared/src/server";
import { type GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerAuthSession({
    req: context.req,
    res: context.res,
  });

  if (!session?.user) {
    return {
      redirect: {
        destination: `/auth/sign-in?callbackUrl=${encodeURIComponent(context.resolvedUrl)}`,
        permanent: false,
      },
    };
  }

  if (
    !context.params ||
    typeof context.params.traceId !== "string" ||
    !context.params.traceId
  ) {
    return {
      props: {
        notFound: true,
      },
    };
  }

  const traceId = context.params.traceId;

  const traces = await getTracesByIdsForAnyProject([traceId]);

  if (!traces || traces.length === 0) {
    return {
      props: {
        notFound: true,
      },
    };
  }

  const accessibleTraces = traces.filter((trace) =>
    hasProjectAccess({
      session,
      projectId: trace.projectId,
      scope: "project:read",
    }),
  );

  if (accessibleTraces.length === 0) {
    return {
      props: {
        notFound: true,
      },
    };
  }

  if (accessibleTraces.length > 1) {
    return {
      props: {
        duplicatesFound: true,
      },
    };
  }

  return {
    redirect: {
      destination: `/project/${accessibleTraces[0].projectId}/traces/${traceId}`,
      permanent: false,
    },
  };
};
