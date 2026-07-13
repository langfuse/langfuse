import { type RouterOutputs } from "@/src/utils/api";
import { useState, useRef, useEffect } from "react";
import { SkillVersionDiffDialog } from "./SkillVersionDiffDialog";
import { Timeline, TimelineItem } from "@/src/components/ui/timeline";
import { Badge } from "@/src/components/ui/badge";
import { CommandItem } from "@/src/components/ui/command";
import { SetSkillVersionLabels } from "@/src/features/skills/components/SetSkillVersionLabels";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";

const SkillHistoryTraceNode = (props: {
  index: number;
  skill: RouterOutputs["skills"]["allVersions"]["skillVersions"][number];
  currentSkill?: RouterOutputs["skills"]["allVersions"]["skillVersions"][number];
  currentSkillVersion: number | undefined;
  setCurrentSkillVersion: (version: number | undefined) => void;
  commentCounts?: Map<string, number>;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isSkillDiffOpen, setIsSkillDiffOpen] = useState(false);
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const { skill } = props;

  // Add ref for scroll into view
  const currentSkillRef = useRef<HTMLDivElement>(null);

  // Add useEffect for scroll into view behavior
  useEffect(() => {
    if (
      props.currentSkillVersion &&
      currentSkillRef.current &&
      props.currentSkillVersion === skill.version
    ) {
      currentSkillRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    // Should only trigger a single time on initial render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSkillRef.current]);

  return (
    <CommandItem
      ref={currentSkillRef}
      value={`# ${skill.version};${skill.commitMessage ?? ""};${skill.labels.join(",")}`}
      style={{
        ["--selected-bg" as string]: "none",
        backgroundColor: "var(--selected-bg)",
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        cursor: "pointer",
      }}
    >
      <TimelineItem
        key={skill.id}
        isActive={props.currentSkillVersion === skill.version}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.closest('[role="button"]') ||
            target.closest('[data-version-trigger="true"]')
          ) {
            return;
          }

          props.index === 0
            ? props.setCurrentSkillVersion(undefined)
            : props.setCurrentSkillVersion(skill.version);
        }}
      >
        <div
          className="items-start gap-1 space-y-1 rounded-none"
          style={{
            cursor: "pointer",
          }}
        >
          <div className="flex flex-wrap items-start gap-1">
            <SetSkillVersionLabels
              title={
                <Badge
                  onClick={(e) => {
                    e.stopPropagation();
                    props.index === 0
                      ? props.setCurrentSkillVersion(undefined)
                      : props.setCurrentSkillVersion(skill.version);
                  }}
                  variant="outline"
                  className="bg-background/50 h-6 shrink-0"
                  data-version-trigger="false"
                >
                  # {skill.version}
                </Badge>
              }
              skillLabels={skill.labels}
              skill={skill}
              isOpen={isLabelPopoverOpen}
              setIsOpen={setIsLabelPopoverOpen}
              showOnlyOnHover
            />
            {props.commentCounts?.get(skill.id) ? (
              <span className="cursor-default" role="button">
                <CommentCountIcon count={props.commentCounts.get(skill.id)} />
              </span>
            ) : null}
          </div>

          <div className="grid w-full grid-cols-1 items-start justify-between gap-1 md:grid-cols-[1fr_auto]">
            <div className="min-h-7 min-w-0">
              {skill.commitMessage && (
                <div className="flex flex-1 flex-nowrap gap-2">
                  <span
                    className="text-muted-foreground max-w-full min-w-0 truncate text-xs"
                    title={skill.commitMessage}
                  >
                    {skill.commitMessage}
                  </span>
                </div>
              )}
              <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
                {skill.createdAt.toLocaleString()} by{" "}
                {skill.creator || skill.createdBy}
              </div>
            </div>
            <div className="flex flex-row justify-end space-x-1">
              {(isHovered ||
                props.currentSkillVersion === skill.version ||
                isSkillDiffOpen) &&
                (props.currentSkill &&
                props.currentSkillVersion !== skill.version ? (
                  <SkillVersionDiffDialog
                    isOpen={isSkillDiffOpen}
                    setIsOpen={(open) => {
                      setIsSkillDiffOpen(open);
                    }}
                    leftSkill={skill}
                    rightSkill={props.currentSkill}
                  />
                ) : null)}
            </div>
          </div>
        </div>
      </TimelineItem>
    </CommandItem>
  );
};

export const SkillHistoryNode = (props: {
  skills: RouterOutputs["skills"]["allVersions"]["skillVersions"];
  currentSkillVersion: number | undefined;
  setCurrentSkillVersion: (id: number | undefined) => void;
  commentCounts?: Map<string, number>;
}) => {
  const currentSkill = props.skills.find(
    (s) => s.version === props.currentSkillVersion,
  );

  return (
    <Timeline>
      {props.skills.map((skill, index) => (
        <SkillHistoryTraceNode
          key={skill.id}
          index={index}
          skill={skill}
          currentSkill={currentSkill}
          currentSkillVersion={props.currentSkillVersion}
          setCurrentSkillVersion={props.setCurrentSkillVersion}
          commentCounts={props.commentCounts}
        />
      ))}
    </Timeline>
  );
};
