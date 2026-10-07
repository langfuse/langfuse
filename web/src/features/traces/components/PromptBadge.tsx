import { LinkBadge } from "@/src/components/design-system/Badge/Badge";

export const PromptBadge = (props: {
  promptName: string;
  promptVersion: number;
  projectId: string;
}) => (
  <LinkBadge
    href={`/project/${props.projectId}/prompts/${encodeURIComponent(props.promptName)}?version=${props.promptVersion}`}
    label="prompt"
    text={`${props.promptName} - v${props.promptVersion}`}
  />
);
