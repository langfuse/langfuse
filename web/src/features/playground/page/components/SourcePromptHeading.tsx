import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tooltip } from "@/src/components/ui/tooltip";
import { type PlaygroundSourcePrompt } from "@/src/features/playground/page/types";

type SourcePromptHeadingProps = {
  sourcePrompt: PlaygroundSourcePrompt;
  isEdited: boolean;
};

export const SourcePromptHeading: React.FC<SourcePromptHeadingProps> = ({
  sourcePrompt,
  isEdited,
}) => {
  const version = `v${sourcePrompt.version}`;

  return (
    <Tooltip>
      <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs leading-tight">
        <span
          className="min-w-0 truncate"
          title={`${sourcePrompt.name} ${version}`}
        >
          {sourcePrompt.name}
        </span>
        <Badge size="sm" text={version} />
        {isEdited && <span className="text-foreground shrink-0">· edited</span>}
      </div>
    </Tooltip>
  );
};
