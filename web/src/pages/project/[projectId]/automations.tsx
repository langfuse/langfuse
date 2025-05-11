import { useRouter } from "next/router";
import { useEffect } from "react";

export default function AutomationsPage() {
  const router = useRouter();
  const { projectId } = router.query;

  useEffect(() => {
    if (projectId) {
      router.replace(`/project/${projectId}/automations/list`);
    }
  }, [projectId, router]);

  return null;
}
