// Redirect helper for /trace/[traceId] URLs
// Looks up the projectId for a trace and redirects to /project/[projectId]/traces/[traceId]
// which displays the current trace view

import { ErrorPage } from "@/src/components/error-page";
import { getTracesByIdsForAnyProject } from "@langfuse/shared/src/server";
import { type GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";

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

const TraceRedirectPage = ({
  notFound,
  duplicatesFound,
}: {
  notFound?: boolean;
  duplicatesFound?: boolean;
}) => {
  const t = useTranslations("coreDetails.traces.page");
  const router = useRouter();
  if (router.isFallback) {
    return <div className="p-3">{t("loading")}</div>;
  }

  if (notFound) {
    return (
      <ErrorPage
        title={t("notFound")}
        message={t("processingOrDeleted")}
        additionalButton={{
          label: t("retry"),
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  if (duplicatesFound) {
    return <ErrorPage title={t("notFound")} message={t("upgradeSdk")} />;
  }

  return null;
};

export default TraceRedirectPage;
