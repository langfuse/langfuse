import { type GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";

// This url is deprecated, we keep this redirect page for backward compatibility
export const getServerSideProps: GetServerSideProps = async (context) => {
  if (!context.params) {
    return {
      notFound: true,
    };
  }
  const projectId = context.params.projectId as string;

  return {
    redirect: {
      destination: `/project/${projectId}/evals/legacy/new`,
      permanent: false,
    },
  };
};

export default function RedirectPage() {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const router = useRouter();
  if (router.isFallback) {
    return <div className="p-3">{t("redirect.loading")}</div>;
  }

  return <div>{t("redirect.redirecting")}</div>;
}
