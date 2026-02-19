import React from "react";
import { cn } from "@/src/utils/tailwind";
import {
  MUSTACHE_REGEX,
  isValidVariableName,
  PromptDependencyRegex,
  type ParsedPromptDependencyTag,
} from "@langfuse/shared";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { FileCode } from "lucide-react";

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

type PromptReference = ParsedPromptDependencyTag & {
  position: number;
};

const PromptReference = ({
  promptRef,
  projectId,
}: {
  promptRef: PromptReference;
  projectId: string;
}) => {
  const getPromptUrl = (projectId: string, tag: PromptReference) => {
    const baseUrl = `/project/${projectId}/prompts/`;
    if (tag.type === "version") {
      return `${baseUrl}${encodeURIComponent(tag.name)}?version=${tag.version}`;
    } else {
      return `${baseUrl}${encodeURIComponent(tag.name)}?label=${encodeURIComponent(tag.label)}`;
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="inline-flex items-center gap-1.5 rounded-sm border-dashed bg-muted/50 px-2 py-0.5 align-[-3px] text-xs font-medium transition-colors hover:bg-muted"
      dir="ltr"
      onClick={() => window.open(getPromptUrl(projectId, promptRef), "_blank")}
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

// Higher-level function that renders prompt content with all the rich formatting
export const renderRichPromptContent = (
  projectId: string,
  content: string,
): React.ReactNode[] => {
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

  // Create combined regex that captures both patterns in a single pass
  // Group 1: prompt dependency inner content, Group 2: variable name
  const combinedRegex = new RegExp(
    `${PromptDependencyRegex.source}|${MUSTACHE_REGEX.source}`,
    "g",
  );

  let match;
  while ((match = combinedRegex.exec(content)) !== null) {
    const index = match.index ?? 0;
    const fullMatch = match[0];

    // Add any text before this match
    if (index > lastIndex) {
      const textBefore = content.substring(lastIndex, index);
      if (textBefore) {
        parts.push(createTextNode(textBefore, `text-${lastIndex}-${index}`));
      }
    }

    // Determine type based on which capture group matched and process directly
    if (match[1] !== undefined) {
      // First capture group = prompt dependency
      const innerContent = match[1];
      const tagParts = innerContent.split("|");
      const params: Record<string, string> = {};

      tagParts.forEach((part) => {
        const [key, value] = part.split("=");
        if (key && value) {
          params[key] = value;
        }
      });

      if (params.name) {
        const tag: PromptReference = params.version
          ? {
              name: params.name,
              type: "version",
              version: Number(params.version),
              position: index,
            }
          : {
              name: params.name,
              type: "label",
              label: params.label || "",
              position: index,
            };

        parts.push(
          <React.Fragment key={`prompt-${index}`}>
            <PromptReference promptRef={tag} projectId={projectId} />
          </React.Fragment>,
        );
      } else {
        parts.push(createTextNode(fullMatch, `raw-${index}`));
      }
    } else if (match[2] !== undefined) {
      // Second capture group = variable
      const variable = match[2];
      const isValid = isValidVariableName(variable);
      parts.push(
        <React.Fragment key={`var-${index}-${variable}`}>
          <PromptVar name={variable} isValid={isValid} />
        </React.Fragment>,
      );
    }

    lastIndex = index + fullMatch.length;
  }

  // Add any remaining text
  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex);
    if (remainingText) {
      parts.push(createTextNode(remainingText, `text-${lastIndex}-end`));
    }
  }

  return parts;
};
