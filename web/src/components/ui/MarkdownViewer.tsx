/* eslint-disable @repo/no-style-props */
import { cn } from "@/src/utils/tailwind";
import {
  type FC,
  type ReactNode,
  type ReactElement,
  memo,
  useMemo,
  isValidElement,
  Children,
  createElement,
} from "react";
import ReactMarkdown, {
  type Options,
  type ExtraProps as ReactMarkdownExtraProps,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/src/components/design-system/Codeblock/Codeblock";
import { useTheme } from "next-themes";
import { ImageOff, Info } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useMarkdownContext } from "@/src/features/theming/useMarkdownContext";
import { MentionBadge } from "@/src/features/comments/components/MentionBadge";
import {
  OpenAIUrlImageUrl,
  MediaReferenceStringSchema,
  PromptDependencyRegex,
  type OpenAIContentParts,
  type OpenAIContentSchema,
  type OpenAIOutputAudioType,
  isOpenAITextContentPart,
  isOpenAIImageContentPart,
  isMediaReferencePart,
  isAiSdkFileContentPart,
} from "@langfuse/shared";
import { type z } from "zod";
import { ResizableImage } from "@/src/components/ui/resizable-image";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { type MediaReturnType } from "@/src/features/media/validation";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { MENTION_USER_PREFIX } from "@/src/features/comments/lib/mentionParser";
import { useCollapsibleSystemPrompt } from "@/src/hooks/useCollapsibleSystemPrompt";
import { Button } from "@/src/components/ui/button";
import { getSafeImageUrl, getSafeLinkUrl } from "@/src/components/ui/safe-url";
import { env } from "@/src/env.mjs";
import {
  getPromptReferenceMarkdownHref,
  getPromptReferenceMarkdownLabel,
  parsePromptDependencyInnerContent,
  parsePromptReferenceMarkdownHref,
  PromptReferenceButton,
  usePromptReferenceProjectId,
} from "@/src/components/ui/PromptReferences";
import {
  filterAlreadyRenderedMedia,
  getRenderedInlineMediaIds,
  getStandaloneMediaReferenceStrings,
} from "@/src/components/ui/markdown-media.utils";
import { exceedsMarkdownRenderLimits } from "@/src/components/ui/markdown-render-limits";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";

type ReactMarkdownNode = ReactMarkdownExtraProps["node"];
type ReactMarkdownNodeChildren = Exclude<
  ReactMarkdownNode,
  undefined
>["children"];

// ReactMarkdown does not render raw HTML by default for security reasons, to prevent XSS (Cross-Site Scripting) attacks.
// html is rendered as plain text by default.
const MemoizedReactMarkdown: FC<Options> = memo(ReactMarkdown);

const isTextElement = (
  child: ReactNode,
): child is ReactElement<{ className?: string }> =>
  isValidElement(child) &&
  typeof child.type === "string" &&
  ["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(child.type);

const isChecklist = (children: ReactNode) =>
  Array.isArray(children) &&
  children.some(
    (child) =>
      isValidElement(child) &&
      (child.props as any)?.className === "task-list-item",
  );

const transformListItemChildren = (children: ReactNode) =>
  Children.map(children, (child) =>
    isTextElement(child)
      ? createElement("span", {
          ...child.props,
          className: cn(child.props.className, "mb-1"),
        })
      : child,
  );

/**
 * A Next.js `<Link>` auto-prepends the configured `NEXT_PUBLIC_BASE_PATH` to
 * root-relative internal hrefs (`/project/...`); a native `<a>` does not. Since
 * markdown links now render as native anchors, replicate that so a hand-authored
 * internal link still resolves under the base path on subpath deployments.
 * Only root-relative paths are rewritten — absolute URLs (with a scheme),
 * protocol-relative (`//`), hash (`#`), search (`?`), and `./`/`../` refs are
 * left untouched (Next's `<Link>` did not prepend the base path to those either).
 */
export const prependBasePathToInternalHref = (
  href: string,
  basePath: string,
): string =>
  basePath && href.startsWith("/") && !href.startsWith("//")
    ? `${basePath}${href}`
    : href;

const isImageNode = (node?: ReactMarkdownNode): boolean =>
  !!node &&
  Array.isArray(node.children) &&
  node.children.some(
    (child: ReactMarkdownNodeChildren[number]) =>
      "tagName" in child && child.tagName === "img",
  );

const getNodeTextContent = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeTextContent).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeTextContent(node.props.children);
  }

  return "";
};

type MarkdownAstNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownAstNode[];
};

const splitTextNodeWithPromptReferences = (
  node: MarkdownAstNode,
): MarkdownAstNode[] => {
  const value = node.value;
  if (!value) return [node];

  const promptRegex = new RegExp(PromptDependencyRegex.source, "g");
  const parts: MarkdownAstNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = promptRegex.exec(value)) !== null) {
    const index = match.index ?? 0;
    const fullMatch = match[0];
    const innerContent = match[1];

    if (typeof innerContent !== "string") continue;

    const tag = parsePromptDependencyInnerContent(innerContent, index);
    if (!tag) continue;

    if (index > lastIndex) {
      parts.push({
        type: "text",
        value: value.slice(lastIndex, index),
      });
    }

    parts.push({
      type: "link",
      url: getPromptReferenceMarkdownHref(tag),
      children: [
        {
          type: "text",
          value: getPromptReferenceMarkdownLabel(tag),
        },
      ],
    });

    lastIndex = index + fullMatch.length;
  }

  if (parts.length === 0) return [node];

  if (lastIndex < value.length) {
    parts.push({
      type: "text",
      value: value.slice(lastIndex),
    });
  }

  return parts;
};

const transformPromptReferenceNodes = (node: MarkdownAstNode): void => {
  if (!Array.isArray(node.children)) return;
  if (
    node.type === "code" ||
    node.type === "inlineCode" ||
    node.type === "link" ||
    node.type === "linkReference"
  ) {
    return;
  }

  node.children = node.children.flatMap((child) => {
    if (child.type === "text") {
      return splitTextNodeWithPromptReferences(child);
    }

    transformPromptReferenceNodes(child);
    return [child];
  });
};

const remarkPromptReferences = () => (tree: MarkdownAstNode) => {
  transformPromptReferenceNodes(tree);
};

/**
 * Stable `react-markdown` `code` renderer. Defined at module scope so React
 * reuses the CodeBlock instance across parent re-renders (copy / scroll state).
 */
function MarkdownCode({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { forcedTheme, resolvedTheme } = useTheme();
  const theme = forcedTheme ?? resolvedTheme;
  const languageMatch = /language-(\w+)/.exec(className || "");
  const language = languageMatch ? languageMatch[1] : "";
  const codeContent = String(children).replace(/\n$/, "");
  const isMultiLine = codeContent.includes("\n");

  return language || isMultiLine ? (
    <CodeBlock
      language={language}
      value={codeContent}
      theme={theme === "dark" ? "dark" : "light"}
    />
  ) : (
    <code className="bg-secondary rounded border px-0.5">{codeContent}</code>
  );
}

const remarkPluginsDefault = [remarkGfm];
const remarkPluginsWithPromptRefs = [remarkGfm, remarkPromptReferences];

// Module-level so custom-element types stay stable across parent re-renders.
// Inline renderers (especially `pre`, which wraps fenced `code`) are a new
// component type every render and remount CodeBlock, dropping local state.
const markdownComponents: NonNullable<Options["components"]> = {
  p({ children, node }) {
    if (isImageNode(node)) {
      return <>{children}</>;
    }
    return <p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>;
  },
  a({ children, href }) {
    const promptReference = parsePromptReferenceMarkdownHref(href);
    if (promptReference) {
      return (
        <PromptReferenceButton
          promptRef={promptReference}
          fallbackText={getNodeTextContent(children)}
        />
      );
    }

    // Handle mention links
    if (href?.startsWith(MENTION_USER_PREFIX)) {
      const userId = href.replace(MENTION_USER_PREFIX, "");
      const displayName = String(children);
      return <MentionBadge userId={userId} displayName={displayName} />;
    }

    // Handle regular links. These are user-content URLs opened in a
    // new tab (target="_blank"), so a native <a> is correct: a Next.js
    // <Link> gives no client-routing benefit for an external new-tab
    // navigation, but it DOES run the router's href validation, which
    // throws "Invalid href '…' passed to next/router" for the many
    // malformed URLs embedded in trace content (e.g. a URL containing
    // a second `https://`). That was a top Sentry noise family
    // (LANGFUSE-5DZ / 5EA / 5ER, ~40k lifetime events). getSafeLinkUrl
    // already gates the protocol/shape; a native <a> never validates.
    // Re-apply NEXT_PUBLIC_BASE_PATH for root-relative internal hrefs,
    // which <Link> used to prepend automatically (subpath deploys).
    const safeHref = getSafeLinkUrl(href);
    if (safeHref) {
      return (
        <a
          href={prependBasePathToInternalHref(
            safeHref,
            env.NEXT_PUBLIC_BASE_PATH ?? "",
          )}
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    }
    return <span className="text-muted-foreground underline">{children}</span>;
  },
  ul({ children }) {
    if (isChecklist(children)) return <ul className="list-none">{children}</ul>;

    // Nested items contain a block list after the label. list-outside
    // plus left padding keeps the marker in the gutter beside that line.
    return <ul className="list-outside list-disc pl-6">{children}</ul>;
  },
  ol({ children, start }) {
    return (
      <ol start={start} className="list-outside list-decimal pl-6">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="mt-1">{transformListItemChildren(children)}</li>;
  },
  pre({ children }) {
    return <pre className="rounded p-2">{children}</pre>;
  },
  h1({ children }) {
    return <h1 className="text-2xl font-bold">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-xl font-bold">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-lg font-bold">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="text-base font-bold">{children}</h4>;
  },
  h5({ children }) {
    return <h5 className="text-sm font-bold">{children}</h5>;
  },
  h6({ children }) {
    return <h6 className="text-xs font-bold">{children}</h6>;
  },
  code: MarkdownCode,
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 pl-4 italic">{children}</blockquote>
    );
  },
  img({ src, alt }) {
    const safeSrc = typeof src === "string" ? getSafeImageUrl(src) : null;
    return safeSrc ? <ResizableImage src={safeSrc} alt={alt} /> : null;
  },
  hr() {
    return <hr className="my-4" />;
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto rounded border text-xs">
        <table className="min-w-full divide-y">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead>{children}</thead>;
  },
  tbody({ children }) {
    return <tbody className="divide-border divide-y">{children}</tbody>;
  },
  tr({ children }) {
    return <tr>{children}</tr>;
  },
  th({ children }) {
    return (
      <th className="px-4 py-2 text-left text-xs font-bold tracking-wider uppercase">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="px-4 py-2 whitespace-nowrap">{children}</td>;
  },
};

function MarkdownRenderer({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  const promptReferenceProjectId = usePromptReferenceProjectId();
  const characterLimit = useMarkdownRenderCharacterLimit();

  // Guard against payloads that would overflow the JS call stack while
  // react-markdown recursively walks the parsed tree (crashes Firefox, whose
  // stack is much smaller than Chrome's). Rendered as plain text instead.
  // See markdown-render-limits.ts for the mechanism.
  const tooLargeOrDeep = useMemo(
    () => exceedsMarkdownRenderLimits(markdown, characterLimit),
    [markdown, characterLimit],
  );

  if (tooLargeOrDeep) {
    return (
      <div className={cn("space-y-2 overflow-x-auto text-sm", className)}>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <Info className="h-3 w-3" />
          Content is too large or deeply nested to render as markdown.
          Displaying as plain text.
        </div>
        <pre className="text-sm break-words whitespace-pre-wrap">
          {markdown}
        </pre>
      </div>
    );
  }

  // Try to parse markdown content

  try {
    // If parsing succeeds, render with ReactMarkdown
    return (
      <div
        className={cn(
          "space-y-2 overflow-x-auto text-sm wrap-break-word",
          className,
        )}
      >
        <MemoizedReactMarkdown
          remarkPlugins={
            promptReferenceProjectId
              ? remarkPluginsWithPromptRefs
              : remarkPluginsDefault
          }
          components={markdownComponents}
        >
          {markdown}
        </MemoizedReactMarkdown>
      </div>
    );
  } catch {
    // fallback to JSON view if markdown parsing fails

    return (
      <>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <Info className="h-3 w-3" />
          Markdown parsing failed. Displaying raw JSON.
        </div>
        <JSONView json={markdown} className="min-w-0" />
      </>
    );
  }
}
const parseOpenAIContentParts = (
  content: z.input<typeof OpenAIContentParts> | null,
): string => {
  return (content ?? [])
    .map((item) => {
      if (typeof item === "string") {
        return item;
      } else if (item.type === "text") {
        return item.text;
      } else if (item.type === "image_url") {
        return `![image](${item.image_url.url})`;
      } else if (item.type === "input_audio") {
        return `![audio](${item.input_audio.data})`;
      }
    })
    .join("\n");
};

export function MarkdownView({
  markdown,
  title,
  titleIcon,
  audio,
  media,
  className,
  controlButtons,
  afterHeader,
  isSystemPrompt,
}: {
  /** The UNPARSED content shape — see `canRenderContentAsMarkdown`. Media
      reference strings must still be strings when they reach the part guards. */
  markdown: string | z.input<typeof OpenAIContentSchema>;
  title?: string;
  titleIcon?: React.ReactNode;
  audio?: OpenAIOutputAudioType;
  media?: MediaReturnType[];
  className?: string;
  controlButtons?: React.ReactNode;
  /** Content to render between header and main content (e.g., thinking blocks) */
  afterHeader?: React.ReactNode;
  /** Collapse long content to a preview. Pass the raw message role check
      (`role === "system"`) — the title can be a message `name` instead of the
      role. Falls back to matching the title for callers without role data. */
  isSystemPrompt?: boolean;
}) {
  const capture = usePostHogClientCapture();
  const { forcedTheme, resolvedTheme } = useTheme();
  const theme = forcedTheme ?? resolvedTheme;
  const { setIsMarkdownEnabled } = useMarkdownContext();

  const markdownContent =
    typeof markdown === "string" ? markdown : parseOpenAIContentParts(markdown);

  // Collapse preview is built from text parts only: serialized image/audio
  // parts (media-reference strings, base64 data URIs) neither survive the
  // generic markdown renderer nor belong in a first-lines text preview — and
  // media alone should not make a prompt collapsible.
  const collapsibleContent =
    typeof markdown === "string"
      ? markdown
      : (markdown ?? [])
          .filter(isOpenAITextContentPart)
          .map((part) => part.text)
          .join("\n");

  const {
    shouldBeCollapsible,
    isCollapsed,
    toggleCollapsed,
    truncatedContent,
  } = useCollapsibleSystemPrompt({
    isSystemPrompt: isSystemPrompt ?? title === "system",
    content: collapsibleContent,
  });

  const handleOnCopy = () => {
    copyTextToClipboard(markdownContent);
  };

  const handleOnValueChange = () => {
    setIsMarkdownEnabled(false);
    capture("trace_detail:io_pretty_format_toggle_group", {
      renderMarkdown: false,
    });
  };

  const inlineMediaReferenceStrings =
    typeof markdown === "string"
      ? getStandaloneMediaReferenceStrings(markdown)
      : [];
  const remainingMedia = filterAlreadyRenderedMedia(
    media,
    getRenderedInlineMediaIds({ markdown, audio }),
  );

  const collapseToggle = shouldBeCollapsible ? (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => toggleCollapsed("inline")}
      className="w-fit text-xs underline"
    >
      {isCollapsed ? "Expand system prompt" : "Collapse system prompt"}
    </Button>
  ) : null;

  return (
    <div className="overflow-hidden" key={theme}>
      {title ? (
        <>
          <MarkdownJsonViewHeader
            title={title}
            titleIcon={titleIcon}
            handleOnValueChange={handleOnValueChange}
            handleOnCopy={handleOnCopy}
            controlButtons={controlButtons}
            collapseControl={
              shouldBeCollapsible
                ? {
                    isCollapsed,
                    onToggle: () => toggleCollapsed("header"),
                  }
                : undefined
            }
          />
          <div className="border-t" />
        </>
      ) : null}
      {afterHeader}
      <div
        className={cn(
          "io-message-content ph-no-capture grid grid-flow-row gap-2 px-1 py-2",
          title === "assistant" || title === "Output" || title === "Model"
            ? "bg-accent-light-green"
            : "",
          title === "system" || title === "Input" ? "bg-card" : "",
          className,
        )}
      >
        {typeof markdown === "string" ? (
          // plain string
          inlineMediaReferenceStrings.length > 0 ? (
            inlineMediaReferenceStrings.map((referenceString, index) => (
              <LangfuseMediaView
                key={`${referenceString}-${index}`}
                mediaReferenceString={referenceString}
              />
            ))
          ) : (
            <>
              <MarkdownRenderer
                markdown={isCollapsed ? truncatedContent : markdown}
              />
              {collapseToggle}
            </>
          )
        ) : (
          // content parts (multi-modal); collapsing hides long TEXT only —
          // attachments are not text, so media parts render either way. That
          // also keeps the shared media strip's dedup honest: it assumes any
          // inline-renderable media did render (LFE-14815).
          <>
            {isCollapsed ? (
              <>
                <MarkdownRenderer markdown={truncatedContent} />
                {(markdown ?? []).map((content, index) =>
                  isOpenAITextContentPart(content)
                    ? null
                    : renderContentPart(content, index),
                )}
              </>
            ) : (
              (markdown ?? []).map(renderContentPart)
            )}
            {collapseToggle}
          </>
        )}
        {audio ? (
          <>
            <MarkdownRenderer
              markdown={audio.transcript ? "[Audio] \n" + audio.transcript : ""}
            />
            <LangfuseMediaView
              mediaReferenceString={audio.data.referenceString}
            />
          </>
        ) : null}
      </div>
      {remainingMedia.length > 0 && (
        <>
          <div className="text-muted-foreground mx-3 border-t px-2 py-1 text-xs">
            Media
          </div>
          <div className="ph-no-capture mx-3 flex flex-wrap gap-2 px-2 pt-1 pb-4">
            {remainingMedia.map((m) => (
              <LangfuseMediaView
                mediaAPIReturnValue={m}
                variant="icon"
                key={m.mediaId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );

  function renderContentPart(
    content: NonNullable<z.input<typeof OpenAIContentParts>>[number],
    index: number,
  ) {
    // A bare reference string is a whole part (LFE-9577).
    if (isMediaReferencePart(content)) {
      return <LangfuseMediaView key={index} mediaReferenceString={content} />;
    }

    if (isAiSdkFileContentPart(content)) {
      return (
        <LangfuseMediaView key={index} mediaReferenceString={content.data} />
      );
    }

    if (isOpenAITextContentPart(content)) {
      return <MarkdownRenderer key={index} markdown={content.text} />;
    }

    if (isOpenAIImageContentPart(content)) {
      const imageUrl = content.image_url.url;
      const safeImageUrl =
        typeof imageUrl === "string" &&
        OpenAIUrlImageUrl.safeParse(imageUrl).success
          ? getSafeImageUrl(imageUrl)
          : null;

      return safeImageUrl ? (
        <div key={index}>
          <ResizableImage src={safeImageUrl} />
        </div>
      ) : MediaReferenceStringSchema.safeParse(imageUrl).success ? (
        <LangfuseMediaView key={index} mediaReferenceString={imageUrl} />
      ) : (
        <div
          key={index}
          className="grid grid-cols-[auto_1fr] items-center gap-2"
        >
          <span title="<Base64 data URI>" className="h-4 w-4">
            <ImageOff className="h-4 w-4" />
          </span>
          <span className="truncate text-sm" title={imageUrl.toString()}>
            {imageUrl.toString()}
          </span>
        </div>
      );
    }

    return content.type === "input_audio" ? (
      <LangfuseMediaView
        key={index}
        mediaReferenceString={content.input_audio.data}
      />
    ) : null;
  }
}
