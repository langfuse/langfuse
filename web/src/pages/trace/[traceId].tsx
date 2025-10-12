import { ErrorPage } from "@/src/components/error-page";
import { getTracesByIdsForAnyProject } from "@langfuse/shared/src/server";
import { type GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const router = useRouter();
  if (router.isFallback) {
    return <div className="p-3">{t("common.status.loading")}</div>;
  }

  if (notFound) {
    return (
      <ErrorPage
        title={t("tracing.trace.errors.notFound")}
        message={t("tracing.trace.errors.notFoundDescription")}
        additionalButton={{
          label: t("common.actions.retry"),
          onClick: () => void window.location.reload(),
        }}
      />
    );
  }

  if (duplicatesFound) {
    return (
      <ErrorPage
        title={t("tracing.trace.errors.notFound")}
        message={t("tracing.trace.errors.sdkUpgradeRequired")}
      />
    );
  }

  return null;
};

export default TraceRedirectPage;
