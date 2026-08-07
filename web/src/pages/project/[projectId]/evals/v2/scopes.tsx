import { type GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const projectId = params?.projectId;

  if (typeof projectId !== "string") {
    return { notFound: true };
  }

  return {
    redirect: {
      destination: `/project/${encodeURIComponent(projectId)}/evals/v2/rules`,
      permanent: false,
    },
  };
};

export default function LegacyEvaluationRulesRedirect() {
  return null;
}
