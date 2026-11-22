import { useCollapsibleSystemPrompt } from "@/src/hooks/useCollapsibleSystemPrompt";

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
  }) => React.ReactNode;
}) {
  const systemPrompt = useCollapsibleSystemPrompt({
    isSystemPrompt,
    content: text,
  });

  return children({
    collapsed: systemPrompt.shouldBeCollapsible
      ? systemPrompt.isCollapsed
      : collapsed,
    setCollapsed: systemPrompt.shouldBeCollapsible
      ? systemPrompt.toggleCollapsed
      : setCollapsed,
  });
}
