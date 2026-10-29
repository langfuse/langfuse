import { useTheme } from "next-themes";
import { FoldVertical, UnfoldVertical } from "@langfuse/icons";
import {
  ChatMessageController,
  ChatMessageContent,
  SystemPromptCollapseController,
  getMessageTitle,
} from "@/src/features/traces";
import { IOSection } from "@/src/components/ui/IOSection";
import { JsonViewController } from "@/src/components/ui/JsonViewController";
import { PrettyJsonViewContent } from "@/src/components/ui/PrettyJsonViewContent";
import { MarkdownViewController } from "@/src/components/ui/MarkdownViewController";
import { MarkdownViewContent } from "@/src/components/ui/MarkdownViewContent";
import { canRenderContentAsMarkdown } from "@/src/components/ui/MarkdownJsonView";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { assertUnreachable } from "@/src/utils/types";

export function PromptMessagePreview({
  message,
}: Pick<React.ComponentProps<typeof ChatMessageController>, "message">) {
  const characterLimit = useMarkdownRenderCharacterLimit();
  const { forcedTheme, resolvedTheme } = useTheme();

  return (
    <ChatMessageController
      message={message}
      title={getMessageTitle(message)}
      isOutputMessage
      contentMode="all"
      defaultCollapsed={false}
    >
      {function renderPromptMessage({
        title,
        data,
        body,
        actions,
        isSystemPrompt,
        collapsed,
        setCollapsed,
        copy,
      }): React.ReactNode {
        if (data.kind === "collapsed" || data.kind === "tools") {
          return (
            <IOSection
              title={title}
              onCopy={data.kind === "tools" ? copy : undefined}
              actions={actions.length > 0 ? actions : undefined}
              collapsed={collapsed}
              onCollapsedChange={setCollapsed}
            >
              {data.kind === "tools" && (
                <ChatMessageContent
                  body={body}
                  renderToolResponse={(response) => (
                    <ChatMessageController
                      message={response}
                      title={getMessageTitle(response)}
                      contentMode="all"
                    >
                      {renderPromptMessage}
                    </ChatMessageController>
                  )}
                />
              )}
            </IOSection>
          );
        }

        if (
          data.kind === "message" &&
          canRenderContentAsMarkdown(data.content, characterLimit)
        ) {
          return (
            <MarkdownViewController markdown={data.content} audio={data.audio}>
              {(state) => (
                <SystemPromptCollapseController
                  isSystemPrompt={isSystemPrompt}
                  text={state.textContent}
                  collapsed={collapsed}
                  setCollapsed={setCollapsed}
                >
                  {({
                    collapsed: sectionCollapsed,
                    setCollapsed: setSectionCollapsed,
                  }) => (
                    <IOSection
                      key={forcedTheme ?? resolvedTheme}
                      title={title}
                      onCopy={state.copy}
                      actions={actions.length > 0 ? actions : undefined}
                      collapsed={sectionCollapsed}
                      onCollapsedChange={setSectionCollapsed}
                    >
                      {!sectionCollapsed && (
                        <ChatMessageContent
                          body={body}
                          renderToolResponse={(response) => (
                            <ChatMessageController
                              message={response}
                              title={getMessageTitle(response)}
                              contentMode="all"
                            >
                              {renderPromptMessage}
                            </ChatMessageController>
                          )}
                        >
                          <MarkdownViewContent state={state} />
                        </ChatMessageContent>
                      )}
                    </IOSection>
                  )}
                </SystemPromptCollapseController>
              )}
            </MarkdownViewController>
          );
        }

        if (data.kind === "data" || data.kind === "message") {
          return (
            <JsonViewController
              json={data.kind === "data" ? data.value : data.content}
              currentView="pretty"
            >
              {(state) => {
                const kind = state.contentKind;
                const sectionActions = [
                  ...(kind === "table" && state.hasExpandableRows
                    ? [
                        {
                          icon: state.allRowsExpanded
                            ? FoldVertical
                            : UnfoldVertical,
                          label: state.allRowsExpanded
                            ? "Collapse all rows"
                            : "Expand all rows",
                          onClick: state.toggleAllRows,
                        },
                      ]
                    : []),
                  ...actions,
                ];
                return (
                  <SystemPromptCollapseController
                    isSystemPrompt={
                      isSystemPrompt &&
                      kind === "markdown" &&
                      state.standaloneMediaReferenceStrings.length === 0
                    }
                    text={state.markdownContent ?? ""}
                    collapsed={collapsed}
                    setCollapsed={setCollapsed}
                  >
                    {({
                      collapsed: sectionCollapsed,
                      setCollapsed: setSectionCollapsed,
                    }) => (
                      <IOSection
                        title={title}
                        onCopy={state.copy}
                        actions={
                          sectionActions.length > 0 ? sectionActions : undefined
                        }
                        collapsed={sectionCollapsed}
                        onCollapsedChange={setSectionCollapsed}
                        variant={kind === "table" ? "table" : "text"}
                      >
                        {!sectionCollapsed && (
                          <ChatMessageContent
                            body={body}
                            renderToolResponse={(response) => (
                              <ChatMessageController
                                message={response}
                                title={getMessageTitle(response)}
                                contentMode="all"
                              >
                                {renderPromptMessage}
                              </ChatMessageController>
                            )}
                          >
                            <PrettyJsonViewContent
                              state={state}
                              title={title}
                              borderless
                            />
                          </ChatMessageContent>
                        )}
                      </IOSection>
                    )}
                  </SystemPromptCollapseController>
                );
              }}
            </JsonViewController>
          );
        }
        return assertUnreachable(data);
      }}
    </ChatMessageController>
  );
}
