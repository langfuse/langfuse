import { StatusBadge } from "@/src/components/layouts/status-badge";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { DeletePromptVersion } from "@/src/features/prompts/components/delete-prompt-version";
import { SetPromptVersionLabels } from "@/src/features/prompts/components/SetPromptVersionLabels";
import { PRODUCTION_LABEL } from "@/src/features/prompts/constants";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type RouterOutputs } from "@/src/utils/api";
import { Pencil } from "lucide-react";
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
  const [isNavigationLoading, setIsNavigationLoading] = useState(false);
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
      return <StatusBadge type={label} key={label} className="h-6" />;
    });

  return (
    <div
      className={`group mb-2 flex cursor-pointer flex-col gap-1 rounded-sm p-2 hover:bg-primary-foreground ${
        props.currentPromptVersion === prompt.version ? "bg-muted" : ""
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        props.index === 0
          ? props.setCurrentPromptVersion(undefined)
          : props.setCurrentPromptVersion(prompt.version);
      }}
    >
      <div className="grid grid-cols-[auto,minmax(100px,1fr)] items-center gap-2">
        <div className="grid h-7 grid-cols-[auto,1fr] items-center">
          <span className="h-6 rounded-sm bg-input p-1 text-xs">
            Version {prompt.version}
          </span>
          {Boolean(prompt.labels.length) && (
            <div className="ml-2 h-full space-x-1 space-y-0.5 overflow-auto">
              {badges}
            </div>
          )}
        </div>
        <div
          className="space-x-1"
          style={{
            visibility: isHovered ? "visible" : "hidden",
          }}
        >
          <SetPromptVersionLabels prompt={prompt} />
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 px-0"
            loading={isNavigationLoading}
            disabled={!hasAccess}
            onClick={() => {
              capture("prompts:update_form_open");
              setIsNavigationLoading(true);
            }}
          >
            <Link
              href={`/project/${props.projectId}/prompts/new?promptId=${encodeURIComponent(prompt.id)}`}
            >
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <DeletePromptVersion
            promptVersionId={prompt.id}
            version={prompt.version}
            countVersions={props.totalCount}
          />
        </div>
      </div>
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
    <div className="flex-1">
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
