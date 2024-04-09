import { useRouter } from "next/router";

export default function useProjectIdFromURL() {
  const router = useRouter();

  return router.query.projectId as string | undefined;
}
