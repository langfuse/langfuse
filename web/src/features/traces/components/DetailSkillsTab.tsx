import {
  type SkillsAvailable,
  type SkillsResourceLoaded,
} from "@langfuse/shared";
import { FileCode2, FileText } from "lucide-react";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";
import { Skeleton } from "@/src/components/ui/skeleton";

type SkillGroup = {
  skill: SkillsAvailable[number];
  files: Set<string>;
};

export function DetailSkillsTab({
  projectId,
  skills,
  isLoading,
}: {
  projectId: string;
  skills:
    | { kind: "available"; items: SkillsAvailable }
    | { kind: "loaded"; items: SkillsResourceLoaded };
  isLoading: boolean;
}) {
  const groups = new Map<string, SkillGroup>();
  for (const skill of skills.items) {
    const key = JSON.stringify([
      skill.langfuseSkillId ?? null,
      skill.skillName,
      skill.skillVersion ?? null,
    ]);
    const group = groups.get(key) ?? { skill, files: new Set<string>() };
    groups.set(key, group);
    if ("filePath" in skill) group.files.add(skill.filePath);
  }
  const fileCount = Array.from(groups.values()).reduce(
    (count, group) => count + group.files.size,
    0,
  );
  const isAvailable = skills.kind === "available";

  return (
    <div className="ph-no-capture flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold">
            {isAvailable ? "Available skills" : "Loaded skills"}
          </h3>
          {!isLoading && groups.size > 0 ? (
            <Badge color="filled" size="sm" text={String(groups.size)} />
          ) : null}
          {!isLoading && !isAvailable && fileCount > 0 ? (
            <span className="text-muted-foreground text-xs">
              {fileCount} {fileCount === 1 ? "file" : "files"} loaded
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {isAvailable
            ? "Skills offered to this generation. Availability does not mean a skill was loaded."
            : "Skill files loaded by this tool call."}
        </p>
      </div>

      {isLoading ? (
        <div
          className="flex flex-col gap-3"
          role="status"
          aria-label="Loading skills"
        >
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
      ) : null}
      {!isLoading && groups.size === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center">
          <FileCode2 className="icon-lg text-muted-foreground" aria-hidden />
          <p className="text-sm font-bold">
            {isAvailable
              ? "No available skills recorded"
              : "No loaded skills recorded"}
          </p>
          <p className="text-muted-foreground max-w-sm text-xs">
            {isAvailable
              ? "This generation has no recorded skill availability."
              : "This tool call has no recorded skill file loads."}
          </p>
        </div>
      ) : null}
      {!isLoading && groups.size > 0 ? (
        <ul className="flex flex-col gap-3">
          {Array.from(groups, ([key, { skill, files }]) => (
            <li key={key} className="min-w-0 overflow-hidden rounded-md border">
              <div className="flex min-w-0 items-center gap-3 px-3 py-3">
                <div className="bg-muted flex shrink-0 items-center justify-center rounded-md p-2">
                  <FileCode2
                    className="icon-base text-muted-foreground"
                    aria-hidden
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {skill.langfuseSkillId && skill.skillVersion != null ? (
                    <LinkBadge
                      href={`/project/${projectId}/skills/${encodeURIComponent(skill.skillName)}?version=${skill.skillVersion}`}
                      text={skill.skillName}
                      newTab
                      noCapture
                    />
                  ) : (
                    <Badge color="ghost" font="mono" text={skill.skillName} />
                  )}
                  {skill.skillVersion != null ? (
                    <Badge
                      color="filled"
                      size="sm"
                      text={`v${skill.skillVersion}`}
                    />
                  ) : null}
                </div>
              </div>
              {files.size > 0 ? (
                <ul className="bg-muted/20 flex flex-col border-t">
                  {Array.from(files, (filePath) => (
                    <li
                      key={filePath}
                      className="flex min-w-0 items-start gap-2 px-3 py-2"
                    >
                      <FileText
                        className="icon-base text-muted-foreground mt-0.5 shrink-0"
                        aria-hidden
                      />
                      <span className="min-w-0 font-mono text-xs leading-relaxed break-all">
                        {filePath}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
