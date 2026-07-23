import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { OverviewRow } from "@/src/components/trace/components/_shared/InspectorElements";
import { api } from "@/src/utils/api";

/**
 * Prompt overview-grid row: links to the prompt version used by the
 * observation. Rendered inside `OverviewGrid` (see InspectorElements).
 */
export const PromptBadge = (props: { promptId: string; projectId: string }) => {
  const prompt = api.prompts.byId.useQuery({
    id: props.promptId,
    projectId: props.projectId,
  });

  if (prompt.isLoading || !prompt.data) return null;

  const text = `${prompt.data.name} v${prompt.data.version}`;

  return (
    <OverviewRow label="Prompt" title={text}>
      <Link
        href={`/project/${props.projectId}/prompts/${encodeURIComponent(prompt.data.name)}?version=${prompt.data.version}`}
        className="hover:text-primary inline-flex max-w-full items-center gap-0.5"
      >
        <span className="truncate" title={text}>
          {text}
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0" />
      </Link>
    </OverviewRow>
  );
};
