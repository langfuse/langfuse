import { type RouterOutputs } from "@/src/utils/api";
import { useState, useRef, useEffect } from "react";
import { PromptVersionDiffDialogContent } from "./PromptVersionDiffDialog";
import {
  Timeline,
  TimelineItem,
} from "@/src/features/prompts/components/timeline";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { CommandItem } from "@/src/components/ui/command";
import { DialogController } from "@/src/components/ui/dialog";
import { SetPromptVersionLabels } from "@/src/features/prompts/components/SetPromptVersionLabels";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { FileDiffIcon } from "lucide-react";

const PromptHistoryTraceNode = (props: {
  index: number;
  prompt: RouterOutputs["prompts"]["allVersions"]["promptVersions"][number];
  currentPrompt?: RouterOutputs["prompts"]["allVersions"]["promptVersions"][number];
  currentPromptVersion: number | undefined;
  setCurrentPromptVersion: (version: number | undefined) => void;
  openCommentDrawer: (promptId: string, promptVersion: number) => void;
  commentCounts?: Map<string, number>;
}) => {
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const { prompt } = props;
  const commentCount = props.commentCounts?.get(prompt.id);

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
          className="flex flex-col gap-1 rounded-none"
          style={{
            cursor: "pointer",
          }}
        >
          <div className="flex flex-wrap items-start gap-1">
            <SetPromptVersionLabels
              title={
                <BadgeShell
                  onClick={(e) => {
                    e.stopPropagation();
                    props.index === 0
                      ? props.setCurrentPromptVersion(undefined)
                      : props.setCurrentPromptVersion(prompt.version);
                  }}
                  font="mono"
                  size="md"
                  data-version-trigger="false"
                >
                  # {prompt.version}
                </BadgeShell>
              }
              promptLabels={prompt.labels}
              prompt={prompt}
              isOpen={isLabelPopoverOpen}
              setIsOpen={setIsLabelPopoverOpen}
              showOnlyOnHover
              trailingActions={
                props.currentPrompt &&
                props.currentPromptVersion !== prompt.version ? (
                  <DialogController
                    size="xl"
                    closeOnInteractionOutside
                    renderContent={({ closeDialog }) => (
                      <PromptVersionDiffDialogContent
                        leftPrompt={prompt}
                        rightPrompt={props.currentPrompt!}
                        closeDialog={closeDialog}
                      />
                    )}
                  >
                    {({ openDialog }) => (
                      <BadgeShell asChild color="ghost" size="md">
                        <button
                          type="button"
                          role="button"
                          title="Compare with selected prompt"
                          className="hover:text-foreground cursor-pointer"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDialog();
                          }}
                        >
                          <FileDiffIcon
                            className="icon-sm shrink-0"
                            aria-hidden
                          />
                          Compare
                        </button>
                      </BadgeShell>
                    )}
                  </DialogController>
                ) : null
              }
            />
            {commentCount ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  props.openCommentDrawer(prompt.id, prompt.version);
                }}
                className="cursor-pointer"
                role="button"
              >
                <CommentCountIcon count={commentCount} />
              </span>
            ) : null}
          </div>

          <div className="min-w-0">
            {prompt.commitMessage && (
              <div className="flex flex-1 flex-nowrap gap-2">
                <span
                  className="text-muted-foreground max-w-full min-w-0 truncate text-xs"
                  title={prompt.commitMessage}
                >
                  {prompt.commitMessage}
                </span>
              </div>
            )}
            <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
              {prompt.createdAt.toLocaleString()} by{" "}
              {prompt.creator || prompt.createdBy}
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
  openCommentDrawer: (promptId: string, promptVersion: number) => void;
  commentCounts?: Map<string, number>;
}) => {
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
          openCommentDrawer={props.openCommentDrawer}
          commentCounts={props.commentCounts}
        />
      ))}
    </Timeline>
  );
};
