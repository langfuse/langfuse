import { useRouter } from "next/router";
import { SessionPage } from "@/src/components/session";
import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export default function Trace() {
  const router = useRouter();
  const sessionId = router.query.sessionId as string;
  const projectId = router.query.projectId as string;

  return <SessionPage sessionId={sessionId} projectId={projectId} />;
}

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? "en", ["common"])),
  },
});
