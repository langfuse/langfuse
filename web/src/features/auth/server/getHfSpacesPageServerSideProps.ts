import { type GetServerSideProps } from "next";
import { env } from "@/src/env.mjs";
import { type PageProps } from "@/src/features/auth/HfSpacesPage";

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  // remove /api/auth from the URL as it needs to be added for custom base url
  const deploymentDomain = env.NEXTAUTH_URL?.replace("/api/auth", "");
  return {
    props: {
      deploymentDomain,
    },
  };
};
