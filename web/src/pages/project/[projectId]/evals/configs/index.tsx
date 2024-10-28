import { type GetServerSideProps } from "next";
import { useRouter } from "next/router";

// This url is deprecated, we keep this redirect page for backward compatibility
export const getServerSideProps: GetServerSideProps = async (context) => {
  const { projectId } = context.params as { projectId: string };

  return {
    redirect: {
      destination: `/project/${projectId}/evals`,
      permanent: false,
    },
  };
};

export default function RedirectPage() {
  const router = useRouter();
  if (router.isFallback) {
    return <div>Loading...</div>;
  }

  return <div>Redirecting...</div>;
}
