import { useRouter } from "next/router";
import { useEffect } from "react";

export default function ModelsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // temporarily redirect to settings/models
  useEffect(() => {
    router.replace(`/project/${projectId}/settings/models`);
  }, [projectId, router]);

  return null;
}
