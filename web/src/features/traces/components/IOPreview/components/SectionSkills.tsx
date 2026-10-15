import { useId, useState } from "react";
import {
  type SkillsAvailable,
  type SkillsResourceLoaded,
} from "@langfuse/shared";
import { FileCode2, FileText } from "lucide-react";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";
import { InternalFeatureBadge } from "@/src/features/feature-flags";

type SkillGroup = {
  skill: SkillsAvailable[number];
  files: Set<string>;
};

export function SectionSkills({
  projectId,
  skills,
}: {
  projectId: string;
  skills:
    | { kind: "available"; items: SkillsAvailable }
    | { kind: "loaded"; items: SkillsResourceLoaded };
}) {
  const id = useId();
  const [groupExpanded, setGroupExpanded] = useState(false);
  const [expandedSkillKey, setExpandedSkillKey] = useState<string | null>(null);
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
  const isAvailable = skills.kind === "available";

  return (
    <section
      className="ph-no-capture border-border border-b pb-4"
      aria-label="Skills"
    >
      <div className="flex items-center gap-2 px-1 py-1">
        <h3 className="io-message-header text-base font-bold">Skills</h3>
        <Badge color="filled" size="sm" text={String(groups.size)} />
        <InternalFeatureBadge />
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="hover:bg-muted/20 flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left"
          aria-expanded={groupExpanded}
          aria-controls={id}
          onClick={() => setGroupExpanded(!groupExpanded)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FileCode2
              className="icon-base text-muted-foreground shrink-0"
              aria-hidden
            />
            <span className="text-sm font-bold">
              {groups.size} {isAvailable ? "available" : "loaded"}{" "}
              {groups.size === 1 ? "skill" : "skills"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Badge
              color="filled"
              size="sm"
              text={groupExpanded ? "hide" : "show"}
            />
            <DropdownIndicator direction={groupExpanded ? "down" : "right"} />
          </span>
        </button>
        <ul
          id={id}
          hidden={!groupExpanded}
          className={groupExpanded ? "flex flex-col gap-2" : undefined}
        >
          {Array.from(groups, ([key, { skill, files }], index) => {
            const isExpanded = expandedSkillKey === key;
            const filesId = `${id}-${index}`;
            return (
              <li
                key={key}
                className="min-w-0 overflow-hidden rounded-sm border"
              >
                <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                  <FileCode2
                    className="icon-base text-muted-foreground shrink-0"
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
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
                  {files.size > 0 ? (
                    <button
                      type="button"
                      className="hover:bg-muted/20 flex shrink-0 items-center gap-1.5 rounded-sm px-1 py-0.5"
                      aria-label={`Files loaded for ${skill.skillName}`}
                      aria-expanded={isExpanded}
                      aria-controls={filesId}
                      onClick={() =>
                        setExpandedSkillKey(isExpanded ? null : key)
                      }
                    >
                      <Badge
                        color="green"
                        size="sm"
                        text={`${files.size} ${files.size === 1 ? "file" : "files"}`}
                      />
                      <DropdownIndicator
                        direction={isExpanded ? "down" : "right"}
                      />
                    </button>
                  ) : null}
                </div>
                {files.size > 0 ? (
                  <ul
                    id={filesId}
                    hidden={!isExpanded}
                    className={
                      isExpanded
                        ? "bg-muted/30 flex flex-col gap-2 border-t px-3 py-3"
                        : undefined
                    }
                  >
                    {Array.from(files, (filePath) => (
                      <li
                        key={filePath}
                        className="flex min-w-0 items-start gap-2"
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
            );
          })}
        </ul>
      </div>
    </section>
  );
}
