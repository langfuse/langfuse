import { type GetServerSideProps } from "next";
import { useTranslations } from "next-intl";

// Keep the bare dataset URL as an alias only; tab content lives on explicit routes.
export const getServerSideProps: GetServerSideProps = async (context) => {
  if (!context.params) {
    return {
      notFound: true,
    };
  }

  const projectId = context.params.projectId as string;
  const datasetId = context.params.datasetId as string;

  return {
    redirect: {
      destination: `/project/${projectId}/datasets/${datasetId}/items`,
      permanent: false,
    },
  };
};

export default function RedirectPage() {
  const t = useTranslations("coreDetails.datasets.page");
  return <div>{t("redirecting")}</div>;
}
