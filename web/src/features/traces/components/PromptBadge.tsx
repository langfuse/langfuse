import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
export const PromptBadge = (props: {
  promptName: string;
  promptVersion: number;
  projectId: string;
}) => {
  const text = `Prompt: ${props.promptName} - v${props.promptVersion}`;

  return (
    <Link
      href={`/project/${props.projectId}/prompts/${encodeURIComponent(props.promptName)}?version=${props.promptVersion}`}
      className="inline-flex"
    >
      <Badge text={text} trailingIcon={ExternalLinkIcon} />
    </Link>
  );
};
