import { useEffect } from "react";
import { useRouter } from "next/router";
import { useRecentProjects } from "@/src/features/app-shell/hooks/useRecentProjects";

/** Remembers every project the user opens, however they got there, for the switcher's recent list. */
export function useRecordRecentProject(userId: string) {
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string" ? router.query.projectId : null;
  const { recordProjectVisit } = useRecentProjects(userId);

  useEffect(() => {
    if (projectId) recordProjectVisit(projectId);
  }, [projectId, recordProjectVisit]);
}
