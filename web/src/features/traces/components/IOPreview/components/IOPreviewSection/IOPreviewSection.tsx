import { useRef, useState, type ComponentProps } from "react";
import { isOpenAITextContentPart, assertUnreachable } from "@langfuse/shared";
import {
  FoldVertical,
  UnfoldVertical,
  ListChevronsDownUp,
  ListChevronsUpDown,
  FileCode2,
  FileText,
} from "@langfuse/icons";
import { IOSection } from "@/src/components/ui/IOSection";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { canRenderContentAsMarkdown } from "@/src/components/ui/MarkdownJsonView";
import { isLargeRenderString } from "@/src/components/ui/largeStringGate";
import { splitStringByMediaReferences } from "@/src/components/ui/media/mediaUtils";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { useCollapsibleSystemPrompt } from "@/src/hooks/useCollapsibleSystemPrompt";
import {
  getMessageTitle,
  shouldRenderMessageForContentMode,
  hasPassthroughJson,
  isPlaceholderMessage,
} from "@/src/features/traces/fns/chatMessageUtils";
import { ChatMessage } from "../ChatMessage";
import { ToolCallDefinitionCard } from "../ToolCallDefinitionCard";
import { LargeJsonFieldFallback } from "../LargeJsonFieldFallback";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { type IOPreviewProps } from "../../IOPreview";

type SectionProps = ComponentProps<typeof IOSection>;

export function IOPreviewSection(
  props: Pick<SectionProps, "title"> &
    (
      | (Pick<SectionProps, "actions" | "tone"> & {
          kind: "json";
          jsonProps: Pick<
            ComponentProps<typeof PrettyJsonView>,
            | "json"
            | "parsedJson"
            | "currentView"
            | "isLoading"
            | "isParsing"
            | "media"
            | "externalExpansionState"
            | "onExternalExpansionChange"
          >;
        })
      | (Pick<SectionProps, "actions" | "defaultCollapsed"> & {
          kind: "message";
          messageProps: Pick<
            ComponentProps<typeof ChatMessage>,
            | "message"
            | "shouldRenderMarkdown"
            | "currentView"
            | "toolCallNumbers"
            | "contentMode"
          >;
          isOutputMessage?: boolean;
        })
      | (Pick<SectionProps, "tone"> & { kind: "status"; text: string })
      | (Pick<SectionProps, "collapsed" | "onCollapsedChange" | "tabs"> & {
          kind: "tools";
          toolsProps: ComponentProps<typeof ToolCallDefinitionCard>;
          activeTab: string;
        })
      | {
          kind: "skills";
          skills: NonNullable<IOPreviewProps["skills"]>;
          projectId: string;
        }
      | { kind: "media"; media: NonNullable<IOPreviewProps["media"]> }
      | (Pick<SectionProps, "actions"> & {
          kind: "large-json";
          fallback: Pick<
            ComponentProps<typeof LargeJsonFieldFallback>,
            "serialized" | "isString" | "charCount" | "downloadFileBase"
          >;
        })
      | (Pick<SectionProps, "info" | "status" | "actions" | "toggle"> & {
          kind: "correction";
          presentation: "section" | "inline";
          hasContent: boolean;
          isEditing: boolean;
          canEdit: boolean;
          onEdit: () => void;
          editor: Pick<
            ComponentProps<typeof CodeMirrorEditor>,
            "value" | "onChange" | "mode" | "editorRef" | "onEditorMount"
          >;
        })
    ),
) {
  if (props.kind === "json") {
    return <JsonPreviewSection {...props} />;
  }
  if (props.kind === "message") {
    return <MessagePreviewSection {...props} />;
  }
  if (props.kind === "correction") {
    const body = (() => {
      if (!props.hasContent && !props.isEditing) {
        return (
          <button
            type="button"
            onClick={props.onEdit}
            disabled={!props.canEdit}
            className="text-muted-foreground hover:text-foreground w-full cursor-pointer text-left text-sm disabled:cursor-not-allowed"
          >
            Click to add corrected output
          </button>
        );
      }
      if (props.isEditing) {
        return (
          <CodeMirrorEditor
            {...props.editor}
            minHeight={200}
            placeholder="Enter corrected output..."
            appearance="flat"
            className="focus-within:ring-ring focus-within:ring-2"
          />
        );
      }
      return (
        <CodeMirrorEditor
          value={props.editor.value}
          mode={props.editor.mode}
          editable={false}
          appearance="flat"
        />
      );
    })();
    if (props.presentation === "section") {
      return (
        <div className="pt-2">
          <IOSection
            title={props.title}
            info={props.info}
            status={props.status}
            actions={props.actions}
            toggle={props.toggle}
          >
            {body}
          </IOSection>
        </div>
      );
    }
    return (
      <div className="group pt-2">
        <div className="flex items-center justify-between py-1.5">
          {props.info && <IOSection.InfoButton info={props.info} />}
          <div className="flex items-center -space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
            <IOSection.Controls
              status={props.status}
              actions={props.actions}
              toggle={props.toggle}
            />
          </div>
        </div>
        {body}
      </div>
    );
  }
  if (props.kind === "status") {
    return (
      <IOSection
        title={props.title}
        tone={props.tone}
        onCopy={() => copyTextToClipboard(props.text)}
      >
        {props.text}
      </IOSection>
    );
  }
  if (props.kind === "tools") {
    return (
      <IOSection
        title={props.title}
        variant="table"
        collapsed={props.collapsed}
        onCollapsedChange={props.onCollapsedChange}
        tabs={props.tabs}
      >
        <ToolCallDefinitionCard key={props.activeTab} {...props.toolsProps} />
      </IOSection>
    );
  }
  if (props.kind === "skills") {
    return (
      <SkillsPreviewSection
        title={props.title}
        skills={props.skills}
        projectId={props.projectId}
      />
    );
  }
  if (props.kind === "media") {
    return (
      <IOSection title={props.title} variant="media">
        <div className="flex flex-wrap gap-2">
          {props.media.map((media) => (
            <LangfuseMediaView
              key={media.mediaId}
              mediaAPIReturnValue={media}
              variant={
                media.contentType.startsWith("image") ? "inline" : "icon"
              }
            />
          ))}
        </div>
      </IOSection>
    );
  }
  if (props.kind === "large-json") {
    return (
      <IOSection title={props.title} actions={props.actions}>
        <LargeJsonFieldFallback
          {...props.fallback}
          title={props.title}
          hideTitle
        />
      </IOSection>
    );
  }
  return assertUnreachable(props);
}

function SkillsPreviewSection({
  title,
  skills,
  projectId,
}: {
  title: string;
  skills: NonNullable<IOPreviewProps["skills"]>;
  projectId: string;
}) {
  const [isExpanded, setExpanded] = useState(false);
  const [expandedSkillKey, setExpandedSkillKey] = useState("");
  const skillGroups = new Map<
    string,
    {
      key: string;
      skill: NonNullable<IOPreviewProps["skills"]>["items"][number];
      files: Set<string>;
    }
  >();
  const skillItems =
    skills.kind === "loaded"
      ? skills.items.map((skill) => ({ skill, filePath: skill.filePath }))
      : skills.items.map((skill) => ({ skill, filePath: undefined }));
  for (const { skill, filePath } of skillItems) {
    const key = JSON.stringify([
      skill.langfuseSkillId ?? null,
      skill.skillName,
      skill.skillVersion ?? null,
    ]);
    const group = skillGroups.get(key) ?? {
      key,
      skill,
      files: new Set<string>(),
    };
    skillGroups.set(key, group);
    if (filePath !== undefined) group.files.add(filePath);
  }
  return (
    <IOSection title={title} count={skillGroups.size}>
      <Collapsible
        open={isExpanded}
        onOpenChange={setExpanded}
        className="flex flex-col gap-2"
      >
        <CollapsibleTrigger className="hover:bg-muted/20 flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left text-sm font-bold">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <FileCode2 size="base" color="muted" aria-hidden />
            <span>
              {skillGroups.size}{" "}
              {skills.kind === "available" ? "available" : "loaded"}{" "}
              {skillGroups.size === 1 ? "skill" : "skills"}
            </span>
          </span>
          <Badge color="filled" size="sm" text={isExpanded ? "hide" : "show"} />
          <DropdownIndicator direction={isExpanded ? "down" : "right"} />
        </CollapsibleTrigger>
        <CollapsibleContent asChild>
          <ul className="flex flex-col gap-2">
            {Array.from(skillGroups.values(), ({ key, skill, files }) => (
              <Collapsible
                key={key}
                asChild
                open={expandedSkillKey === key}
                onOpenChange={(open) => setExpandedSkillKey(open ? key : "")}
              >
                <li className="min-w-0 overflow-hidden rounded-sm border">
                  <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                    <FileCode2 size="base" color="muted" aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      {skill.langfuseSkillId && skill.skillVersion != null ? (
                        <LinkBadge
                          href={`/project/${projectId}/skills/${encodeURIComponent(skill.skillName)}?version=${skill.skillVersion}`}
                          text={skill.skillName}
                          newTab
                          noCapture
                        />
                      ) : (
                        <Badge
                          color="ghost"
                          font="mono"
                          text={skill.skillName}
                        />
                      )}
                      {skill.skillVersion != null ? (
                        <Badge
                          color="filled"
                          size="sm"
                          text={`v${skill.skillVersion}`}
                        />
                      ) : null}
                    </div>
                    {files.size > 0 ? (
                      <CollapsibleTrigger
                        className="hover:bg-muted/20 flex shrink-0 items-center gap-1.5 rounded-sm px-1 py-0.5"
                        aria-label={`Files loaded for ${skill.skillName}`}
                      >
                        <Badge
                          color="green"
                          size="sm"
                          text={`${files.size} ${files.size === 1 ? "file" : "files"}`}
                        />
                        <DropdownIndicator
                          direction={
                            expandedSkillKey === key ? "down" : "right"
                          }
                        />
                      </CollapsibleTrigger>
                    ) : null}
                  </div>
                  {files.size > 0 ? (
                    <CollapsibleContent asChild>
                      <ul className="bg-muted/30 flex flex-col gap-2 border-t px-3 py-3">
                        {Array.from(files, (filePath) => (
                          <li
                            key={filePath}
                            className="flex min-w-0 items-start gap-2"
                          >
                            <FileText
                              size="base"
                              color="muted"
                              __rawClassName="mt-0.5"
                              aria-hidden
                            />
                            <span className="min-w-0 font-mono text-xs leading-relaxed break-all">
                              {filePath}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  ) : null}
                </li>
              </Collapsible>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </IOSection>
  );
}

function JsonPreviewSection({
  kind: _kind,
  jsonProps,
  actions,
  ...sectionProps
}: Extract<ComponentProps<typeof IOPreviewSection>, { kind: "json" }>) {
  const [allRowsExpanded, setAllRowsExpanded] = useState(false);
  const expandAllRef = useRef<(() => void) | null>(null);
  const copyRef = useRef<(() => void) | null>(null);
  const [variant, setVariant] = useState<"text" | "table">("text");
  const [canExpand, setCanExpand] = useState(false);
  return (
    <IOSection
      {...sectionProps}
      variant={variant}
      onCopy={() => copyRef.current?.()}
      actions={[
        ...(canExpand
          ? [
              {
                icon: allRowsExpanded ? FoldVertical : UnfoldVertical,
                label: allRowsExpanded
                  ? "Collapse all rows"
                  : "Expand all rows",
                onClick: () => expandAllRef.current?.(),
              },
            ]
          : []),
        ...(actions ?? []),
      ]}
    >
      <PrettyJsonView
        {...jsonProps}
        borderless
        downloadLabel={sectionProps.title}
        expandAllRef={expandAllRef}
        onExpandStateChange={setAllRowsExpanded}
        copyRef={copyRef}
        onDisplayModeChange={setVariant}
        onExpandabilityChange={setCanExpand}
      />
    </IOSection>
  );
}

function MessagePreviewSection({
  kind: _kind,
  messageProps,
  isOutputMessage,
  actions,
  defaultCollapsed,
  ...sectionProps
}: Extract<ComponentProps<typeof IOPreviewSection>, { kind: "message" }>) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const [showPassthroughJson, setShowPassthroughJson] = useState(false);
  const [allRowsExpanded, setAllRowsExpanded] = useState(false);
  const expandAllRef = useRef<(() => void) | null>(null);
  const copyRef = useRef<(() => void) | null>(null);
  const [variant, setVariant] = useState<"text" | "table">("text");
  const [canExpand, setCanExpand] = useState(false);
  const characterLimit = useMarkdownRenderCharacterLimit();
  const { message } = messageProps;
  const placeholder = isPlaceholderMessage(message);
  const textContent = (() => {
    if (message.role !== "system" || isLargeRenderString(message.content))
      return "";
    if (typeof message.content === "string")
      return splitStringByMediaReferences(message.content)
        .filter((part) => part.type === "text")
        .map((part) => part.value)
        .join("")
        .trim();
    if (Array.isArray(message.content))
      return message.content
        .filter(isOpenAITextContentPart)
        .map((part) => part.text)
        .join("\n");
    return "";
  })();
  const systemPrompt = useCollapsibleSystemPrompt({
    isSystemPrompt: (() => {
      if (message.role !== "system" || showPassthroughJson) return false;
      if (!textContent || textContent.length > characterLimit) return false;
      if (
        !messageProps.shouldRenderMarkdown &&
        (messageProps.currentView !== "pretty" ||
          typeof message.content !== "string")
      )
        return false;
      return canRenderContentAsMarkdown(message.content, characterLimit);
    })(),
    content: textContent,
  });
  const isCollapsed = systemPrompt.shouldBeCollapsible
    ? systemPrompt.isCollapsed
    : collapsed;
  return (
    <IOSection
      {...sectionProps}
      title={
        placeholder
          ? "Placeholder"
          : sectionProps.title || (isOutputMessage ? "Output" : "Input")
      }
      collapsed={isCollapsed}
      onCollapsedChange={
        systemPrompt.shouldBeCollapsible
          ? systemPrompt.toggleCollapsed
          : setCollapsed
      }
      variant={variant}
      actions={[
        ...(canExpand
          ? [
              {
                icon: allRowsExpanded ? FoldVertical : UnfoldVertical,
                label: allRowsExpanded
                  ? "Collapse all rows"
                  : "Expand all rows",
                onClick: () => expandAllRef.current?.(),
              },
            ]
          : []),
        ...(messageProps.contentMode !== "conversation" &&
        hasPassthroughJson(message)
          ? [
              {
                icon: showPassthroughJson
                  ? ListChevronsDownUp
                  : ListChevronsUpDown,
                label: showPassthroughJson
                  ? "Show formatted view"
                  : "Show passthrough JSON data",
                onClick: () => setShowPassthroughJson((value) => !value),
                active: showPassthroughJson,
              },
            ]
          : []),
        ...(actions ?? []),
      ]}
      onCopy={isCollapsed ? undefined : () => copyRef.current?.()}
    >
      <ChatMessage
        {...messageProps}
        showPassthroughJson={showPassthroughJson}
        borderless
        expandAllRef={expandAllRef}
        onExpandStateChange={setAllRowsExpanded}
        copyRef={copyRef}
        onDisplayModeChange={setVariant}
        onExpandabilityChange={setCanExpand}
        renderResponse={(response) =>
          shouldRenderMessageForContentMode(
            response,
            messageProps.contentMode ?? "all",
            undefined,
          ) ? (
            <IOPreviewSection
              kind="message"
              title={getMessageTitle(response)}
              defaultCollapsed={false}
              messageProps={{
                message: response,
                shouldRenderMarkdown: messageProps.shouldRenderMarkdown,
                currentView: messageProps.currentView,
                contentMode: messageProps.contentMode,
              }}
            />
          ) : null
        }
      />
    </IOSection>
  );
}
