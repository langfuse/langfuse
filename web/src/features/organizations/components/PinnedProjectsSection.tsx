import { type Session } from "next-auth";

import { PinnedProjectCard, type PinnedProject } from "./PinnedProjectCard";
import { type LastTraceAt } from "./projectActivity";

const MIN_PINNED = 3;

type Organizations = NonNullable<Session["user"]>["organizations"];

/** All starred projects; when fewer than three, topped up with recent ones. */
export const selectPinnedProjects = ({
  organizations,
  starredIds,
  recentIds,
  lastTraceByProjectId,
  search,
}: {
  organizations: Organizations;
  starredIds: string[];
  recentIds: string[];
  lastTraceByProjectId: Map<string, LastTraceAt>;
  search?: string;
}): PinnedProject[] => {
  const byId = new Map<string, PinnedProject>();
  for (const org of organizations) {
    for (const project of org.projects) {
      if (project.deletedAt) continue;
      byId.set(project.id, {
        id: project.id,
        name: project.name,
        orgName: org.name,
        lastTraceAt: lastTraceByProjectId.get(project.id),
        source: "starred",
      });
    }
  }

  const pinned: PinnedProject[] = [];
  for (const id of starredIds) {
    const p = byId.get(id);
    if (p) pinned.push(p);
  }
  for (const id of recentIds) {
    if (pinned.length >= MIN_PINNED) break;
    const p = byId.get(id);
    if (p && !pinned.some((x) => x.id === id))
      pinned.push({ ...p, source: "recent" });
  }

  return search
    ? pinned.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : pinned;
};

export const PinnedProjectsSection = ({
  projects,
  isStarred,
  onToggleStar,
}: {
  projects: PinnedProject[];
  isStarred: (projectId: string) => boolean;
  onToggleStar: (projectId: string) => void;
}) => {
  return (
    <section aria-label="Pinned projects" className="flex flex-col gap-3">
      <h3 className="text-muted-foreground text-xs tracking-wide uppercase">
        Pinned
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <PinnedProjectCard
            key={project.id}
            project={project}
            isStarred={isStarred(project.id)}
            onToggleStar={onToggleStar}
          />
        ))}
      </div>
    </section>
  );
};
