import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { cn } from "@/src/utils/tailwind";
import { Code } from "lucide-react";
import { useRouter } from "next/router";

interface Project {
  id: string;
  name: string;
  role: string;
}

interface ProjectNavProps {
  currentProjectId: string;
  projects: Project[];
}

const ProjectNav: React.FC<ProjectNavProps> = ({
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
      <SelectTrigger className="h-8 bg-gray-50 text-indigo-600">
        <SelectValue
          className="text-sm font-semibold text-indigo-600"
          placeholder={currentProjectId}
        />
      </SelectTrigger>
      <SelectContent side="top">
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <div className="flex items-center space-x-2 font-semibold text-primary">
              <span
                className={cn(
                  currentProjectId === project.id
                    ? "border-indigo-600 text-indigo-600"
                    : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border bg-white p-1 text-[0.625rem] font-medium",
                )}
              >
                <Code />
              </span>
              <span
                className={cn(
                  "truncate",
                  currentProjectId === project.id
                    ? "border-indigo-600 text-indigo-600"
                    : "text-gray-400",
                )}
              >
                {project.name}
              </span>
              {project.name === "langfuse-docs" ? (
                <span
                  className={cn(
                    "self-center whitespace-nowrap break-keep rounded-sm border px-1 py-0.5 text-xs",
                    currentProjectId === project.id
                      ? "border-indigo-600 text-indigo-600"
                      : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
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

export default ProjectNav;
