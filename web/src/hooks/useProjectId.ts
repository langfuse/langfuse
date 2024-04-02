import { useRouter } from "next/router";

export default function useProjectId() {
  const router = useRouter();

  if (!router.query.projectId) {
    throw new Error("useProjectId must be used within a project route");
  }

  return router.query.projectId as string;
}
