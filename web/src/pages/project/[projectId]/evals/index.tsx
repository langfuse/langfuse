import type { GetServerSideProps } from "next";
import { isForceV3ExperienceProject } from "@langfuse/shared/src/server";

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const projectId = params?.projectId;

  if (typeof projectId === "string" && isForceV3ExperienceProject(projectId)) {
    return {
      redirect: {
        destination: `/project/${encodeURIComponent(projectId)}/evals/legacy`,
        permanent: false,
      },
    };
  }

  return { props: {} };
};

export { default } from "@/src/features/evals/v2/pages/EvaluatorsPage";
