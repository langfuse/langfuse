// PROTOTYPE — throwaway. Project scope picker shared by the create-form variants.

import { useState } from "react";
import { Building2, Check, ChevronDown, FolderGit2, X } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { PopoverController } from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { type ProjectOption } from "./permissionCatalog";

export const ProjectMultiSelect = ({
  projects,
  allProjects,
  projectIds,
  onChange,
}: {
  projects: ProjectOption[];
  allProjects: boolean;
  projectIds: string[];
  onChange: (next: { allProjects: boolean; projectIds: string[] }) => void;
}) => {
  const [query, setQuery] = useState("");

  const selected = new Set(projectIds);
  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  const toggleProject = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ allProjects: false, projectIds: [...next] });
  };

  const removeProject = (id: string) =>
    onChange({
      allProjects: false,
      projectIds: projectIds.filter((x) => x !== id),
    });

  return (
    <PopoverController
      align="start"
      modal={false}
      disabled={false}
      contentClassName="w-[--radix-popover-trigger-width] p-0"
      renderContent={() => (
        <>
          <div className="border-b p-2">
            <Input
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            <Row
              label="All projects"
              hint="Key works across every project"
              icon={<Building2 className="h-4 w-4" />}
              checked={allProjects}
              onSelect={() => onChange({ allProjects: true, projectIds: [] })}
            />
            <div className="my-1 border-t" />
            {filtered.map((p) => (
              <Row
                key={p.id}
                label={p.name}
                icon={<FolderGit2 className="h-4 w-4" />}
                checked={!allProjects && selected.has(p.id)}
                onSelect={() => toggleProject(p.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="text-muted-foreground px-2 py-6 text-center text-xs">
                No projects found
              </div>
            )}
          </div>
        </>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <div
            tabIndex={0}
            className="border-input bg-background flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
          >
            {allProjects || projectIds.length === 0 ? (
              <Building2 className="h-4 w-4 shrink-0" />
            ) : (
              <FolderGit2 className="h-4 w-4 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {allProjects || projectIds.length === 0 ? (
                <span>All projects</span>
              ) : (
                projectIds.map((id) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="gap-1 font-normal"
                  >
                    {projects.find((p) => p.id === id)?.name ?? id}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeProject(id);
                      }}
                      className="hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Trigger>
      )}
    </PopoverController>
  );
};

const Row = ({
  label,
  hint,
  icon,
  checked,
  onSelect,
}: {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  checked: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
  >
    <span className="text-muted-foreground shrink-0">{icon}</span>
    <span className="min-w-0 flex-1 truncate" title={label}>
      {label}
      {hint && (
        <span className="text-muted-foreground ml-2 text-xs">{hint}</span>
      )}
    </span>
    <Check
      className={cn("h-4 w-4 shrink-0", checked ? "opacity-100" : "opacity-0")}
    />
  </button>
);
