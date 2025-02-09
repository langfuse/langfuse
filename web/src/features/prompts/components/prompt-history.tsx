import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DeletePromptVersion } from "@/src/features/prompts/components/delete-prompt-version";
import { SetPromptVersionLabels } from "@/src/features/prompts/components/SetPromptVersionLabels";
import { PRODUCTION_LABEL } from "@/src/features/prompts/constants";
import { type RouterOutputs } from "@/src/utils/api";
import { type NextRouter, useRouter } from "next/router";
import { useState, useRef, useEffect } from "react";
import { PromptVersionDiffDialog } from "./PromptVersionDiffDialog";

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
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const [isPromptDiffOpen, setIsPromptDiffOpen] = useState(false);
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

  let badges: JSX.Element[] = prompt.labels
    .sort((a, b) =>
      a === PRODUCTION_LABEL
        ? -1
        : b === PRODUCTION_LABEL
          ? 1
          : a.localeCompare(b),
    )
    .map((label) => {
      return (
        <StatusBadge
          type={label}
          key={label}
          className="break-all sm:break-normal"
        />
      );
    });

  return (
    <div
      ref={currentPromptRef}
      className={`group mb-2 flex w-full cursor-pointer flex-col gap-1 rounded-sm p-2 hover:bg-primary-foreground ${
        props.currentPromptVersion === prompt.version ? "bg-muted" : ""
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        if (!isLabelPopoverOpen) setIsHovered(false);
      }}
      onClick={() => {
        props.index === 0
          ? props.setCurrentPromptVersion(undefined)
          : props.setCurrentPromptVersion(prompt.version);
      }}
    >
      <div className="flex h-full min-h-6 flex-wrap gap-1">
        <span className="text-nowrap rounded-sm bg-input p-1 text-xs">
          Version {prompt.version}
        </span>
        {badges}
      </div>
      <div className="grid w-full grid-cols-1 items-start justify-between gap-1 md:grid-cols-[1fr,auto]">
        <div className="min-w-0">
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground">
              {prompt.createdAt.toLocaleString()}
            </span>
          </div>
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
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground">
              by {prompt.creator || prompt.createdBy}
            </span>
          </div>
        </div>
        {(isHovered ||
          props.currentPromptVersion === prompt.version ||
          isPromptDiffOpen) && (
          <div className="flex flex-row justify-end space-x-1">
            {props.currentPrompt &&
            props.currentPromptVersion !== prompt.version ? (
              <PromptVersionDiffDialog
                isOpen={isPromptDiffOpen}
                setIsOpen={(open) => {
                  setIsPromptDiffOpen(open);
                  if (!open) setIsHovered(false);
                }}
                leftPrompt={prompt}
                rightPrompt={props.currentPrompt}
              />
            ) : null}
            <SetPromptVersionLabels
              prompt={prompt}
              isOpen={isLabelPopoverOpen}
              setIsOpen={(open) => {
                setIsLabelPopoverOpen(open);
                if (!open) setIsHovered(false);
              }}
            />
            <DeletePromptVersion
              promptVersionId={prompt.id}
              version={prompt.version}
              countVersions={props.totalCount}
            />
          </div>
        )}
      </div>
    </div>
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
    <div className="w-full flex-1">
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
    </div>
  );
};
