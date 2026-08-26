import { ArrowUpRight } from "lucide-react";
import { api } from "@/src/utils/api";
import { HeaderPill } from "@/src/components/layouts/header-pill";

export const PromptBadge = (props: { promptId: string; projectId: string }) => {
  const prompt = api.prompts.byId.useQuery({
    id: props.promptId,
    projectId: props.projectId,
  });

  if (prompt.isLoading || !prompt.data) return null;

  const text = `${prompt.data.name} · v${prompt.data.version}`;

  return (
    <HeaderPill
      variant="link"
      href={`/project/${props.projectId}/prompts/${encodeURIComponent(prompt.data.name)}?version=${prompt.data.version}`}
    >
      prompt{" "}
      <span
        className="text-foreground group-hover:text-link truncate"
        title={text}
      >
        {text}
      </span>
      <ArrowUpRight className="text-link h-3 w-3 shrink-0" />
    </HeaderPill>
  );
};
