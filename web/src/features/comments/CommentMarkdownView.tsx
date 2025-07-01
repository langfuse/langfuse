import React from "react";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { cn } from "@/src/utils/tailwind";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";

interface MentionedUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface CommentMarkdownViewProps {
  markdown: string;
  mentionedUsers?: MentionedUser[];
  className?: string;
}

// Custom renderer for mentions
const MentionRenderer: React.FC<{
  mentionText: string;
  mentionedUsers?: MentionedUser[];
}> = ({ mentionText, mentionedUsers }) => {
  // Extract the mention name/email from the text (remove @ symbol)
  const mentionName = mentionText.slice(1).trim();
  
  // Find the mentioned user
  const mentionedUser = mentionedUsers?.find(
    (user) => user.name === mentionName || user.email === mentionName
  );

  if (!mentionedUser) {
    // Fallback for mentions without user data
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
        {mentionText}
      </span>
    );
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-sm font-medium text-blue-700 cursor-pointer hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30">
          <Avatar className="h-4 w-4">
            <AvatarImage src={mentionedUser.image || undefined} />
            <AvatarFallback className="text-xs">
              {mentionedUser.name
                ? mentionedUser.name
                    .split(" ")
                    .map((word) => word[0])
                    .slice(0, 2)
                    .join("")
                : mentionedUser.email[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          {mentionText}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={mentionedUser.image || undefined} />
            <AvatarFallback>
              {mentionedUser.name
                ? mentionedUser.name
                    .split(" ")
                    .map((word) => word[0])
                    .slice(0, 2)
                    .join("")
                : mentionedUser.email[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {mentionedUser.name || mentionedUser.email}
            </p>
            {mentionedUser.name && (
              <p className="text-xs text-muted-foreground truncate">
                {mentionedUser.email}
              </p>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export function CommentMarkdownView({
  markdown,
  mentionedUsers,
  className,
}: CommentMarkdownViewProps) {
  // Process markdown to replace mentions with components
  const processedMarkdown = React.useMemo(() => {
    if (!mentionedUsers || mentionedUsers.length === 0) {
      return markdown;
    }

    // Create a regex to match mentions
    const mentionRegex = /@([^\s@]+(?:\s+[^\s@]+)*)/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(markdown)) !== null) {
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push(markdown.slice(lastIndex, match.index));
      }

      // Add the mention component
      const mentionText = match[0];
      parts.push(
        <MentionRenderer
          key={`mention-${match.index}`}
          mentionText={mentionText}
          mentionedUsers={mentionedUsers}
        />
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < markdown.length) {
      parts.push(markdown.slice(lastIndex));
    }

    return parts;
  }, [markdown, mentionedUsers]);

  // If we have processed mentions, render them inline with markdown
  if (Array.isArray(processedMarkdown) && processedMarkdown.length > 1) {
    return (
      <div className={cn("space-y-2", className)}>
        {processedMarkdown.map((part, index) => {
          if (typeof part === "string") {
            return (
              <MarkdownView
                key={`text-${index}`}
                markdown={part}
              />
            );
          }
          return part;
        })}
      </div>
    );
  }

  // Fallback to regular markdown view for content without mentions
  return (
    <div className={className}>
      <MarkdownView markdown={markdown} />
    </div>
  );
}