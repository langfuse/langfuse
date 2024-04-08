import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { cn } from "@/src/utils/tailwind";
import { useRouter } from "next/router";

interface Project {
  id: string;
  name: string;
  role: string;
}

interface ProjectNavigationProps {
  currentProjectId: string;
  projects: Project[];
}

export const ProjectNavigation: React.FC<ProjectNavigationProps> = ({
  currentProjectId,
  projects,
}) => {
  const router = useRouter();
  return (
    <Select
      value={currentProjectId}
      onValueChange={(value) => {
        router.push(`/project/${value}`);
      }}
    >
      <SelectTrigger className="text-gray-700 ring-transparent focus:ring-0 focus:ring-offset-0">
        <SelectValue
          className="text-sm font-semibold text-gray-700"
          placeholder={currentProjectId}
        />
      </SelectTrigger>
      <SelectContent className="max-h-60 max-w-80">
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <div className="flex items-center space-x-2 font-semibold text-primary">
              <span
                className={cn(
                  "truncate",
                  currentProjectId === project.id
                    ? "border-gray-700 text-gray-700"
                    : "text-gray-400",
                )}
              >
                {project.name}
              </span>
              {project.role === "VIEWER" ? (
                <span
                  className={cn(
                    "self-center whitespace-nowrap break-keep rounded-sm border px-1 py-0.5 text-xs",
                    currentProjectId === project.id
                      ? "border-gray-700 text-gray-700"
                      : "border-gray-200 text-gray-400 group-hover:border-gray-700 group-hover:text-gray-700",
                  )}
                >
                  view-only
                </span>
              ) : null}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
