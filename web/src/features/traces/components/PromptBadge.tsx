/* eslint-disable @repo/no-null-render */
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { api } from "@/src/utils/api";

export const PromptBadge = (props: { promptId: string; projectId: string }) => {
  const prompt = api.prompts.byId.useQuery({
    id: props.promptId,
    projectId: props.projectId,
  });

  if (prompt.isLoading || !prompt.data) return null;

  const text = `${prompt.data.name} v${prompt.data.version}`;

  return (
    <Link
      href={`/project/${props.projectId}/prompts/${encodeURIComponent(prompt.data.name)}?version=${prompt.data.version}`}
      title={`Prompt: ${text}`}
      className="text-muted-foreground hover:text-foreground inline-flex max-w-48 items-center gap-1 text-xs hover:underline"
    >
      <span className="truncate" title={`Prompt: ${text}`}>
        {text}
      </span>
      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
    </Link>
  );
};
