import { type RouterOutputs } from "@/src/utils/api";
import { type NextRouter, useRouter } from "next/router";
import { useState, useRef, useEffect } from "react";
import { PromptVersionDiffDialog } from "./PromptVersionDiffDialog";
import { Timeline, TimelineItem } from "@/src/components/ui/timeline";
import { Badge } from "@/src/components/ui/badge";
import { CommandItem } from "@/src/components/ui/command";
import { SetPromptVersionLabels } from "@/src/features/prompts/components/SetPromptVersionLabels";

const PromptHistoryTraceNode = (props: {
  index: number;
  prompt: RouterOutputs["prompts"]["allVersions"]["promptVersions"][number];
  currentPrompt?: RouterOutputs["prompts"]["allVersions"]["promptVersions"][number];
  currentPromptVersion: number | undefined;
  setCurrentPromptVersion: (version: number | undefined) => void;
  router: NextRouter;
  projectId: string;
  totalCount: number;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPromptDiffOpen, setIsPromptDiffOpen] = useState(false);
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const { prompt } = props;

  // Add ref for scroll into view
  const currentPromptRef = useRef<HTMLDivElement>(null);

  // Add useEffect for scroll into view behavior
  useEffect(() => {
    if (
      props.currentPromptVersion &&
      currentPromptRef.current &&
      props.currentPromptVersion === prompt.version
    ) {
      currentPromptRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    // Should only trigger a single time on initial render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPromptRef.current]);

  return (
    <CommandItem
      ref={currentPromptRef}
      value={`# ${prompt.version};${prompt.commitMessage ?? ""};${prompt.labels.join(",")}`}
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
        key={prompt.id}
        isActive={props.currentPromptVersion === prompt.version}
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
            ? props.setCurrentPromptVersion(undefined)
            : props.setCurrentPromptVersion(prompt.version);
        }}
      >
        <div
          className="items-start gap-1 space-y-1 rounded-none"
          style={{
            cursor: "pointer",
          }}
        >
          <div className="flex flex-wrap items-start gap-1">
            <SetPromptVersionLabels
              title={
                <Badge
                  onClick={(e) => {
                    e.stopPropagation();
                    props.index === 0
                      ? props.setCurrentPromptVersion(undefined)
                      : props.setCurrentPromptVersion(prompt.version);
                  }}
                  variant="outline"
                  className="h-6 shrink-0 bg-background/50"
                  data-version-trigger="false"
                >
                  # {prompt.version}
                </Badge>
              }
              promptLabels={prompt.labels}
              prompt={prompt}
              isOpen={isLabelPopoverOpen}
              setIsOpen={setIsLabelPopoverOpen}
              showOnlyOnHover
            />
          </div>

          <div className="grid w-full grid-cols-1 items-start justify-between gap-1 md:grid-cols-[1fr,auto]">
            <div className="min-h-7 min-w-0">
              {prompt.commitMessage && (
                <div className="flex flex-1 flex-nowrap gap-2">
                  <span
                    className="min-w-0 max-w-full truncate text-xs text-muted-foreground"
                    title={prompt.commitMessage}
                  >
                    {prompt.commitMessage}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                {prompt.createdAt.toLocaleString()} by{" "}
                {prompt.creator || prompt.createdBy}
              </div>
            </div>
            <div className="flex flex-row justify-end space-x-1">
              {(isHovered ||
                props.currentPromptVersion === prompt.version ||
                isPromptDiffOpen) &&
                (props.currentPrompt &&
                props.currentPromptVersion !== prompt.version ? (
                  <PromptVersionDiffDialog
                    isOpen={isPromptDiffOpen}
                    setIsOpen={(open) => {
                      setIsPromptDiffOpen(open);
                    }}
                    leftPrompt={prompt}
                    rightPrompt={props.currentPrompt}
                  />
                ) : null)}
            </div>
          </div>
        </div>
      </TimelineItem>
    </CommandItem>
  );
};

export const PromptHistoryNode = (props: {
  prompts: RouterOutputs["prompts"]["allVersions"]["promptVersions"];
  currentPromptVersion: number | undefined;
  setCurrentPromptVersion: (id: number | undefined) => void;
  totalCount: number;
}) => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const currentPrompt = props.prompts.find(
    (p) => p.version === props.currentPromptVersion,
  );

  return (
    <Timeline>
      {props.prompts.map((prompt, index) => (
        <PromptHistoryTraceNode
          key={prompt.id}
          index={index}
          prompt={prompt}
          currentPrompt={currentPrompt}
          currentPromptVersion={props.currentPromptVersion}
          setCurrentPromptVersion={props.setCurrentPromptVersion}
          router={router}
          projectId={projectId}
          totalCount={props.totalCount}
        />
      ))}
    </Timeline>
  );
};
