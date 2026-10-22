import { useState } from "react";
import {
  type SkillsAvailable,
  type SkillsResourceLoaded,
} from "@langfuse/shared";
import { FileCode2, FileText } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { IOSection } from "@/src/components/ui/IOSection";

export function SectionSkills({ projectId, skills }: SectionSkillsProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedSkillKey, setExpandedSkillKey] = useState("");
  const groups = groupSkills(skills.items);
  const visibleGroups = showAll ? groups : groups.slice(0, 3);

  return (
    <IOSection
      title={skills.kind === "available" ? "Available skills" : "Loaded skills"}
      count={groups.length}
    >
      <ul className="ph-no-capture flex flex-col gap-2">
        {visibleGroups.map((group) => (
          <SkillRow
            key={group.key}
            projectId={projectId}
            group={group}
            expanded={expandedSkillKey === group.key}
            onExpandedChange={setExpandedSkillKey}
          />
        ))}
      </ul>
      {groups.length > 3 ? (
        <div className="pt-2">
          <Button
            text={showAll ? "Show fewer" : `Show all ${groups.length} skills`}
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((value) => !value)}
          />
        </div>
      ) : null}
    </IOSection>
  );
}

function SkillRow({
  projectId,
  group,
  expanded,
  onExpandedChange,
}: SkillRowProps) {
  const { skill, files } = group;

  function handleOpenChange(open: boolean) {
    onExpandedChange(open ? group.key : "");
  }

  return (
    <Collapsible asChild open={expanded} onOpenChange={handleOpenChange}>
      <li className="min-w-0 overflow-hidden rounded-sm border">
        <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
          <FileCode2 size="base" color="muted" aria-hidden />
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
              <Badge color="filled" size="sm" text={`v${skill.skillVersion}`} />
            ) : null}
          </div>
          {files.size > 0 ? (
            <CollapsibleTrigger
              className="hover:bg-muted/20 flex shrink-0 items-center gap-1.5 rounded-sm px-1 py-0.5"
              aria-label={`Files loaded for ${skill.skillName}`}
            >
              <Badge
                color="filled"
                size="sm"
                text={`${files.size} ${files.size === 1 ? "file" : "files"}`}
              />
              <DropdownIndicator direction={expanded ? "down" : "right"} />
            </CollapsibleTrigger>
          ) : null}
        </div>
        {files.size > 0 ? (
          <CollapsibleContent asChild>
            <ul className="bg-muted/30 flex flex-col gap-2 border-t px-3 py-3">
              {Array.from(files, (filePath) => (
                <SkillFileRow key={filePath} filePath={filePath} />
              ))}
            </ul>
          </CollapsibleContent>
        ) : null}
      </li>
    </Collapsible>
  );
}

function SkillFileRow({ filePath }: SkillFileRowProps) {
  return (
    <li className="flex min-w-0 items-start gap-2">
      <FileText size="base" color="muted" __rawClassName="mt-0.5" aria-hidden />
      <span className="min-w-0 font-mono text-xs leading-relaxed break-all">
        {filePath}
      </span>
    </li>
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
  expanded: boolean;
  onExpandedChange: (key: string) => void;
};

type SkillFileRowProps = {
  filePath: string;
};

type SkillGroup = {
  key: string;
  skill: SkillsAvailable[number];
  files: Set<string>;
};
