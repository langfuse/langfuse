import { Metric } from "@/src/components/design-system/Metric/Metric";

export const PromptBadge = (props: {
  promptName: string;
  promptVersion: number;
  projectId: string;
}) => (
  <Metric
    href={`/project/${props.projectId}/prompts/${encodeURIComponent(props.promptName)}?version=${props.promptVersion}`}
    label="prompt"
    value={`${props.promptName} - v${props.promptVersion}`}
  />
);
