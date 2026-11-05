import { type ReactNode } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { useCollapsibleSystemPrompt } from "@/src/hooks/useCollapsibleSystemPrompt";

type SystemPromptCollapseSource = "inline" | "header";

function SystemPromptCollapseButton({
  onCollapse,
}: {
  onCollapse: () => void;
}) {
  return (
    <Button
      type="button"
      variant="text"
      size="sm"
      text="Collapse system prompt"
      onClick={onCollapse}
    />
  );
}

/** Top and bottom controls for an expanded long system prompt. Both call the
 *  same persisted preference, so either one hides the section. */
function SystemPromptCollapseEnds({
  onCollapse,
  children,
}: {
  onCollapse: (source: SystemPromptCollapseSource) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <SystemPromptCollapseButton onCollapse={() => onCollapse("header")} />
      {children}
      <SystemPromptCollapseButton onCollapse={() => onCollapse("inline")} />
    </div>
  );
}

export function SystemPromptCollapseController({
  isSystemPrompt,
  text,
  collapsed,
  setCollapsed,
  children,
}: {
  isSystemPrompt: boolean;
  text: string;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  children: (state: {
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
    renderCollapseEnds: (content: ReactNode) => ReactNode;
  }) => ReactNode;
}) {
  const systemPrompt = useCollapsibleSystemPrompt({
    isSystemPrompt,
    content: text,
  });

  const collapseFrom = (source: SystemPromptCollapseSource) => {
    systemPrompt.toggleCollapsed(source);
  };

  const showCollapseEnds =
    systemPrompt.shouldBeCollapsible && !systemPrompt.isCollapsed;

  return children({
    collapsed: systemPrompt.shouldBeCollapsible
      ? systemPrompt.isCollapsed
      : collapsed,
    setCollapsed: systemPrompt.shouldBeCollapsible
      ? () => collapseFrom("header")
      : setCollapsed,
    renderCollapseEnds: (content) =>
      showCollapseEnds ? (
        <SystemPromptCollapseEnds onCollapse={collapseFrom}>
          {content}
        </SystemPromptCollapseEnds>
      ) : (
        content
      ),
  });
}
