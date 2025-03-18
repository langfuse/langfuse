import { type GetServerSideProps } from "next";
import { useRouter } from "next/router";

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
      destination: `/project/${projectId}/evals`,
      permanent: false,
    },
  };
};

export default function RedirectPage() {
  const router = useRouter();
  if (router.isFallback) {
    return <div className="p-3">Loading...</div>;
  }

  return <div>Redirecting...</div>;
}
