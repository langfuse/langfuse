import { StatusBadge } from "@/src/components/layouts/status-badge";
import { type RouterOutputs } from "@/src/utils/api";
import { type NextRouter, useRouter } from "next/router";

const PromptHistoryTraceNode = (props: {
  index: number;
  prompt: RouterOutputs["prompts"]["allVersions"][number];
  currentPromptVersion: number | undefined;
  setCurrentPromptVersion: (version: number | undefined) => void;
  router: NextRouter;
  projectId: string;
}) => (
  <div
    className={`group mb-2 flex cursor-pointer flex-col gap-1 rounded-sm p-2 hover:bg-gray-50 ${
      props.currentPromptVersion === props.prompt.version ? "bg-gray-100" : ""
    }`}
    onClick={() => {
      props.index === 0
        ? props.setCurrentPromptVersion(undefined)
        : props.setCurrentPromptVersion(props.prompt.version);
    }}
  >
    <div className="flex items-center gap-2">
      <span className="rounded-sm bg-gray-200 p-1 text-xs">
        Version {props.prompt.version}
      </span>
      {props.prompt.isActive ? <StatusBadge type={"production"} /> : null}
    </div>

    <div className="flex gap-2">
      <span className="text-xs text-gray-500">
        {props.prompt.createdAt.toLocaleString()}
      </span>
    </div>
    <div className="flex gap-2">
      <span className="text-xs text-gray-500">
        by {props.prompt.creator || props.prompt.createdBy}
      </span>
    </div>
  </div>
);

export const PromptHistoryNode = (props: {
  prompts: RouterOutputs["prompts"]["allVersions"];
  currentPromptVersion: number | undefined;
  setCurrentPromptVersion: (id: number | undefined) => void;
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
        />
      ))}
    </div>
  );
};
