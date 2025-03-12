import { Badge } from "@/src/components/ui/badge";

import {
  PromptDependencyRegex,
  type ParsedPromptDependencyTag,
} from "@langfuse/shared";

import { FileCode } from "lucide-react";
import { Button } from "@/src/components/ui/button";

const getPromptUrl = (projectId: string, tag: ParsedPromptDependencyTag) => {
  const baseUrl = `/project/${projectId}/prompts/`;
  if (tag.type === "version") {
    return `${baseUrl}${encodeURIComponent(tag.name)}?version=${tag.version}`;
  } else {
    return `${baseUrl}${encodeURIComponent(tag.name)}?label=${encodeURIComponent(tag.label)}`;
  }
};

export const renderContentWithPromptButtons = (
  projectId: string,
  content: string,
) => {
  if (!content) return null;

  const regex = PromptDependencyRegex;
  const parts: React.ReactNode[] = [];

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }

    const tagContent = match[0];
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
      const tag: ParsedPromptDependencyTag = params.version
        ? {
            name: params.name,
            type: "version",
            version: Number(params.version),
          }
        : { name: params.name, type: "label", label: params.label || "" };

      parts.push(
        <Button
          key={`${tag.name}-${match.index}`}
          variant="outline"
          size="sm"
          className="inline-flex items-center gap-1.5 rounded-sm border-dashed bg-muted/50 px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted"
          onClick={() => window.open(getPromptUrl(projectId, tag), "_blank")}
          title={`Open prompt: ${tag.name}${tag.type === "version" ? ` (v${tag.version})` : tag.label ? ` (${tag.label})` : ""}`}
        >
          <FileCode className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">
            {tag.name}
            {tag.type === "version" ? (
              <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
                v{tag.version}
              </Badge>
            ) : tag.label ? (
              <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
                {tag.label}
              </Badge>
            ) : (
              ""
            )}
          </span>
        </Button>,
      );
    } else {
      parts.push(tagContent);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return parts;
};
