import { useQuery } from "@tanstack/react-query";
import { env } from "@/src/env.mjs";
import { ProjectMemberNamesResponse } from "@/src/features/rbac/types/project-member-names";

export function ProjectMemberNames({ projectId }: { projectId: string }) {
  const membersQuery = useQuery({
    queryKey: ["project-member-names", projectId],
    queryFn: async () => {
      const response = await fetch(
        `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/project/${encodeURIComponent(projectId)}/members`,
      );
      if (!response.ok) {
        throw new Error("Failed to load project members");
      }
      return ProjectMemberNamesResponse.parse(await response.json());
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const memberNames = membersQuery.isPending
    ? "Loading…"
    : membersQuery.isError
      ? "Unavailable"
      : membersQuery.data.members.length > 0
        ? membersQuery.data.members.map((member) => member.name).join(", ")
        : "No members";

  return (
    <span
      aria-label="Project team members"
      className="text-muted-foreground text-xs"
    >
      Team: {memberNames}
    </span>
  );
}
