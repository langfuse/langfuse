import { useState } from "react";
import {
  type SkillsAvailable,
  type SkillsResourceLoaded,
} from "@langfuse/shared";
import { FileCode2, FileText } from "@langfuse/icons";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { IOSection } from "@/src/components/ui/IOSection";
import { cn } from "@/src/utils/tailwind";

export function SectionSkills({ projectId, skills }: SectionSkillsProps) {
  const [expandedSkillKey, setExpandedSkillKey] = useState("");
  const groups = groupSkills(skills.items);
  const singleLoadedSkill =
    skills.kind === "loaded" && groups.length === 1 ? groups[0] : undefined;
  const title =
    skills.kind === "available" ? "Available skills" : "Loaded skills";

  return (
    <IOSection
      title={singleLoadedSkill ? "Loaded skill" : title}
      count={singleLoadedSkill ? undefined : groups.length}
      variant="table"
      defaultCollapsed={groups.length > 5}
    >
      {singleLoadedSkill ? (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 pb-1.5">
            <FileCode2 size="base" color="muted" aria-hidden />
            <SkillIdentity
              projectId={projectId}
              skill={singleLoadedSkill.skill}
            />
          </div>
          <div className="border-border border-t py-3 pl-5.5">
            <SkillFiles files={singleLoadedSkill.files} />
          </div>
        </div>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {groups.map((group, index) => (
            <SkillRow
              key={group.key}
              projectId={projectId}
              group={group}
              rowNumber={index + 1}
              expanded={expandedSkillKey === group.key}
              onExpandedChange={setExpandedSkillKey}
            />
          ))}
        </ul>
      )}
    </IOSection>
  );
}

function SkillRow({
  projectId,
  group,
  rowNumber,
  expanded,
  onExpandedChange,
}: SkillRowProps) {
  const { skill, files } = group;

  function handleOpenChange(open: boolean) {
    onExpandedChange(open ? group.key : "");
  }

  return (
    <Collapsible asChild open={expanded} onOpenChange={handleOpenChange}>
      <li className="group/skill-row min-w-0">
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 py-1.5 group-first/skill-row:pt-0",
            !expanded && "group-last/skill-row:pb-0",
          )}
        >
          {files.size > 0 ? (
            <CollapsibleTrigger
              className="hover:bg-muted/20 flex shrink-0 cursor-pointer items-center rounded-sm"
              aria-label={`Files loaded for ${skill.skillName}`}
            >
              <DropdownIndicator direction={expanded ? "down" : "right"} />
            </CollapsibleTrigger>
          ) : null}
          <FileCode2 size="base" color="muted" aria-hidden />
          <span className="text-foreground text-sm">{rowNumber}.</span>
          <SkillIdentity projectId={projectId} skill={skill} />
          {files.size > 0 ? (
            <span className="text-muted-foreground shrink-0 text-xs">
              {files.size} {files.size === 1 ? "file" : "files"}
            </span>
          ) : null}
        </div>
        {files.size > 0 ? (
          <CollapsibleContent className="border-border border-t py-3 pl-11">
            <SkillFiles files={files} />
          </CollapsibleContent>
        ) : null}
      </li>
    </Collapsible>
  );
}

function SkillIdentity({
  projectId,
  skill,
}: {
  projectId: string;
  skill: SkillsAvailable[number];
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
      {skill.langfuseSkillId && skill.skillVersion != null ? (
        <LinkBadge
          href={`/project/${projectId}/skills/${encodeURIComponent(skill.skillName)}?version=${skill.skillVersion}`}
          text={skill.skillName}
          newTab
          noCapture
        />
      ) : (
        <span className="min-w-0 truncate text-sm" title={skill.skillName}>
          {skill.skillName}
        </span>
      )}
      {skill.skillVersion != null ? (
        <Badge color="filled" size="sm" text={`v${skill.skillVersion}`} />
      ) : null}
    </div>
  );
}

function SkillFiles({ files }: { files: Set<string> }) {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from(files, (filePath) => (
        <li key={filePath} className="flex min-w-0 items-start gap-2">
          <FileText
            size="base"
            color="muted"
            __rawClassName="mt-0.5"
            aria-hidden
          />
          <span className="min-w-0 font-mono text-xs leading-relaxed break-all">
            {filePath}
          </span>
        </li>
      ))}
    </ul>
  );
}

function groupSkills(
  items: SectionSkillsProps["skills"]["items"],
): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const skill of items) {
    const key = JSON.stringify([
      skill.langfuseSkillId ?? null,
      skill.skillName,
      skill.skillVersion ?? null,
    ]);
    const group = groups.get(key) ?? { key, skill, files: new Set<string>() };
    groups.set(key, group);
    if ("filePath" in skill) group.files.add(skill.filePath);
  }
  return Array.from(groups.values());
}

export interface SectionSkillsProps {
  projectId: string;
  skills:
    | { kind: "available"; items: SkillsAvailable }
    | { kind: "loaded"; items: SkillsResourceLoaded };
}

type SkillRowProps = {
  projectId: string;
  group: SkillGroup;
  rowNumber: number;
  expanded: boolean;
  onExpandedChange: (key: string) => void;
};

type SkillGroup = {
  key: string;
  skill: SkillsAvailable[number];
  files: Set<string>;
};
