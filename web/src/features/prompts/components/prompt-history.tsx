import { StatusBadge } from "@/src/components/layouts/status-badge";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { DeletePromptVersion } from "@/src/features/prompts/components/delete-prompt-version";
import { SetPromptVersionLabels } from "@/src/features/prompts/components/SetPromptVersionLabels";
import { PRODUCTION_LABEL } from "@/src/features/prompts/constants";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type RouterOutputs } from "@/src/utils/api";
import { Pencil, PencilOff } from "lucide-react";
import Link from "next/link";
import { type NextRouter, useRouter } from "next/router";
import { useState } from "react";

const PromptHistoryTraceNode = (props: {
  index: number;
  prompt: RouterOutputs["prompts"]["allVersions"]["promptVersions"][number];
  currentPromptVersion: number | undefined;
  setCurrentPromptVersion: (version: number | undefined) => void;
  router: NextRouter;
  projectId: string;
  totalCount: number;
}) => {
  const capture = usePostHogClientCapture();
  const [isHovered, setIsHovered] = useState(false);
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "prompts:CUD",
  });
  const { prompt } = props;
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
        <div>
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground">
              {prompt.createdAt.toLocaleString()}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground">
              by {prompt.creator || prompt.createdBy}
            </span>
          </div>
        </div>
        {isHovered && (
          <div className="flex flex-row justify-end space-x-1">
            <SetPromptVersionLabels
              prompt={prompt}
              isOpen={isLabelPopoverOpen}
              setIsOpen={(open) => {
                setIsLabelPopoverOpen(open);
                if (!open) setIsHovered(false);
              }}
            />
            {hasAccess ? (
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 px-0"
                onClick={() => {
                  capture("prompts:update_form_open");
                }}
              >
                <Link
                  href={`/project/${props.projectId}/prompts/new?promptId=${encodeURIComponent(prompt.id)}`}
                >
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 px-0"
                disabled
              >
                <PencilOff className="h-4 w-4" />
              </Button>
            )}
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
  return (
    <div className="w-full flex-1">
      {props.prompts.map((prompt, index) => (
        <PromptHistoryTraceNode
          key={prompt.id}
          index={index}
          prompt={prompt}
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
