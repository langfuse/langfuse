import React, { createContext, useContext, type ReactNode } from "react";
import {
  MUSTACHE_REGEX,
  PromptDependencyRegex,
  isValidVariableName,
  type ParsedPromptDependencyTag,
} from "@langfuse/shared";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { FileCode } from "lucide-react";

const PromptReferenceContext = createContext<string | undefined>(undefined);

export const PromptReferenceProvider = ({
  projectId,
  children,
}: {
  projectId?: string;
  children: ReactNode;
}) => (
  <PromptReferenceContext.Provider value={projectId}>
    {children}
  </PromptReferenceContext.Provider>
);

export const usePromptReferenceProjectId = () =>
  useContext(PromptReferenceContext);

export type PromptReferenceWithPosition = ParsedPromptDependencyTag & {
  position: number;
};

export const parsePromptDependencyInnerContent = (
  innerContent: string,
  position: number,
): PromptReferenceWithPosition | null => {
  const params: Record<string, string> = {};

  innerContent.split("|").forEach((part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) return;

    const key = part.slice(0, separatorIndex);
    const value = part.slice(separatorIndex + 1);

    if (key && value) {
      params[key] = value;
    }
  });

  if (!params.name) return null;

  if (params.version) {
    const version = Number(params.version);
    if (!Number.isFinite(version)) return null;

    return {
      name: params.name,
      type: "version",
      version,
      position,
    };
  }

  return {
    name: params.name,
    type: "label",
    label: params.label || "",
    position,
  };
};

export const getPromptReferenceUrl = (
  projectId: string,
  tag: ParsedPromptDependencyTag,
) => {
  const baseUrl = `/project/${projectId}/prompts/`;
  if (tag.type === "version") {
    return `${baseUrl}${encodeURIComponent(tag.name)}?version=${tag.version}`;
  }

  return `${baseUrl}${encodeURIComponent(tag.name)}?label=${encodeURIComponent(tag.label)}`;
};

const escapeMarkdownLinkText = (text: string) =>
  text.replace(/[[\]\\]/g, "\\$&");

export const replacePromptReferencesWithMarkdownLinks = (
  projectId: string,
  content: string,
): string => {
  if (!content) return content;

  return content.replace(
    PromptDependencyRegex,
    (fullMatch: string, innerContent: string, offset: number) => {
      if (typeof innerContent !== "string") return fullMatch;

      const tag = parsePromptDependencyInnerContent(innerContent, offset);
      if (!tag) return fullMatch;

      const suffix =
        tag.type === "version" ? ` v${tag.version}` : ` ${tag.label}`.trimEnd();
      const linkText = escapeMarkdownLinkText(`${tag.name}${suffix}`);
      return `[${linkText}](${getPromptReferenceUrl(projectId, tag)})`;
    },
  );
};

export const PromptReferenceButton = ({
  promptRef,
  fallbackText,
}: {
  promptRef: PromptReferenceWithPosition;
  fallbackText: string;
}) => {
  const projectId = usePromptReferenceProjectId();

  if (!projectId) {
    return (
      <span
        dir="auto"
        style={{ unicodeBidi: "plaintext" }}
        className="whitespace-pre-wrap break-words"
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="inline-flex items-center gap-1.5 rounded-sm border-dashed bg-muted/50 px-2 py-0.5 align-[-3px] text-xs font-medium transition-colors hover:bg-muted"
      dir="ltr"
      onClick={() =>
        window.open(getPromptReferenceUrl(projectId, promptRef), "_blank")
      }
      title={`Open prompt: ${promptRef.name}${promptRef.type === "version" ? ` (v${promptRef.version})` : promptRef.label ? ` (${promptRef.label})` : ""}`}
    >
      <FileCode className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
      <span className="truncate font-medium">
        {promptRef.name}
        {promptRef.type === "version" ? (
          <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
            v{promptRef.version}
          </Badge>
        ) : promptRef.label ? (
          <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
            {promptRef.label}
          </Badge>
        ) : (
          ""
        )}
      </span>
    </Button>
  );
};

const PromptVar = ({ name, isValid }: { name: string; isValid: boolean }) => (
  <span
    dir="ltr"
    style={{ unicodeBidi: "isolate" }}
    className={cn(
      isValid ? "text-primary-accent" : "text-destructive",
      "whitespace-nowrap",
    )}
  >
    {`{{${name}}}`}
  </span>
);

export const renderRichPromptContent = (content: string): React.ReactNode[] => {
  if (!content) return [];

  const createTextNode = (text: string, key: string) => (
    <span
      key={key}
      dir="auto"
      style={{ unicodeBidi: "plaintext" }}
      className="whitespace-pre-wrap break-words"
    >
      {text}
    </span>
  );

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const combinedRegex = new RegExp(
    `${PromptDependencyRegex.source}|${MUSTACHE_REGEX.source}`,
    "g",
  );

  let match;
  while ((match = combinedRegex.exec(content)) !== null) {
    const index = match.index ?? 0;
    const fullMatch = match[0];

    if (index > lastIndex) {
      const textBefore = content.substring(lastIndex, index);
      if (textBefore) {
        parts.push(createTextNode(textBefore, `text-${lastIndex}-${index}`));
      }
    }

    if (match[1] !== undefined) {
      const tag = parsePromptDependencyInnerContent(match[1], index);
      parts.push(
        tag ? (
          <React.Fragment key={`prompt-${index}`}>
            <PromptReferenceButton promptRef={tag} fallbackText={fullMatch} />
          </React.Fragment>
        ) : (
          createTextNode(fullMatch, `raw-${index}`)
        ),
      );
    } else if (match[2] !== undefined) {
      const variable = match[2];
      parts.push(
        <React.Fragment key={`var-${index}-${variable}`}>
          <PromptVar name={variable} isValid={isValidVariableName(variable)} />
        </React.Fragment>,
      );
    }

    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex);
    if (remainingText) {
      parts.push(createTextNode(remainingText, `text-${lastIndex}-end`));
    }
  }

  return parts;
};
