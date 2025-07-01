import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import { cn } from "@/src/utils/tailwind";
import { type Control } from "react-hook-form";
import { type CreateCommentData } from "@langfuse/shared";
import { type z } from "zod/v4";

export interface MentionUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface CommentMentionInputProps {
  control: Control<z.infer<typeof CreateCommentData>>;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  projectId: string;
}

export function CommentMentionInput({
  control,
  onKeyDown,
  projectId,
}: CommentMentionInputProps) {
  const session = useSession();
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPosition, setMentionPosition] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch project members for mentions - using the existing members endpoint
  const { data: projectMembers } = api.members.allFromProject.useQuery(
    {
      orgId: session.data?.user?.organizations?.[0]?.id || "",
      projectId,
      page: 0,
      limit: 50, // Reasonable limit for mentions
    },
    {
      enabled: showMentions && !!session.data?.user?.organizations?.[0]?.id,
    }
  );

  // Filter members based on mention query
  const filteredMembers = useMemo(() => {
    if (!projectMembers?.memberships) return [];
    
    return projectMembers.memberships
      .filter((member) => {
        const name = member.user?.name?.toLowerCase() || "";
        const email = member.user?.email?.toLowerCase() || "";
        const query = mentionQuery.toLowerCase();
        return name.includes(query) || email.includes(query);
      })
      .map((member) => ({
        id: member.user?.id || "",
        name: member.user?.name || null,
        email: member.user?.email || "",
        image: member.user?.image || null,
      }))
      .filter((member) => member.id !== session.data?.user?.id) // Don't show current user
      .slice(0, 10); // Limit to 10 suggestions
  }, [projectMembers, mentionQuery, session.data?.user?.id]);

  const handleTextareaChange = useCallback(
    (value: string, onChange: (value: string) => void) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPosition = textarea.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPosition);
      const mentionMatch = textBeforeCursor.match(/@([^@\s]*)$/);

      if (mentionMatch) {
        const mentionStart = cursorPosition - mentionMatch[0].length;
        setMentionPosition({ start: mentionStart, end: cursorPosition });
        setMentionQuery(mentionMatch[1]);
        setShowMentions(true);
        setSelectedIndex(0);
      } else {
        setShowMentions(false);
        setMentionPosition(null);
        setMentionQuery("");
      }

      onChange(value);
    },
    []
  );

  const insertMention = useCallback(
    (user: MentionUser, currentValue: string, onChange: (value: string) => void) => {
      if (!mentionPosition || !textareaRef.current) return;

      const beforeMention = currentValue.slice(0, mentionPosition.start);
      const afterMention = currentValue.slice(mentionPosition.end);
      const mentionText = `@${user.name || user.email} `;

      const newValue = beforeMention + mentionText + afterMention;
      onChange(newValue);

      // Reset mention state
      setShowMentions(false);
      setMentionPosition(null);
      setMentionQuery("");

      // Set cursor position after the mention
      setTimeout(() => {
        const newCursorPosition = mentionPosition.start + mentionText.length;
        textareaRef.current?.setSelectionRange(newCursorPosition, newCursorPosition);
        textareaRef.current?.focus();
      }, 0);
    },
    [mentionPosition]
  );

  const handleKeyDownWithMentions = useCallback(
    (
      event: React.KeyboardEvent<HTMLTextAreaElement>,
      currentValue: string,
      onChange: (value: string) => void
    ) => {
      if (showMentions && filteredMembers.length > 0) {
        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            setSelectedIndex((prev) => 
              prev < filteredMembers.length - 1 ? prev + 1 : 0
            );
            return;
          case "ArrowUp":
            event.preventDefault();
            setSelectedIndex((prev) => 
              prev > 0 ? prev - 1 : filteredMembers.length - 1
            );
            return;
          case "Enter":
          case "Tab":
            if (selectedIndex < filteredMembers.length) {
              event.preventDefault();
              insertMention(filteredMembers[selectedIndex], currentValue, onChange);
              return;
            }
            break;
          case "Escape":
            event.preventDefault();
            setShowMentions(false);
            setMentionPosition(null);
            setMentionQuery("");
            return;
        }
      }

      // Call the original onKeyDown handler
      onKeyDown(event);
    },
    [showMentions, filteredMembers, selectedIndex, insertMention, onKeyDown]
  );

  return (
    <FormField
      control={control}
      name="content"
      render={({ field }) => (
        <FormItem className="relative">
          <FormControl>
            <Textarea
              ref={textareaRef}
              placeholder="Add comment... (use @ to mention users)"
              {...field}
              onChange={(e) => handleTextareaChange(e.target.value, field.onChange)}
              onKeyDown={(e) => handleKeyDownWithMentions(e, field.value, field.onChange)}
              onBlur={() => {
                // Delay hiding mentions to allow for clicks
                setTimeout(() => setShowMentions(false), 200);
              }}
              className="border-none text-sm focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
            />
          </FormControl>
          
          {showMentions && filteredMembers.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 z-50 mb-1">
              <Command className="rounded-md border shadow-md">
                <CommandList className="max-h-40">
                  <CommandEmpty>No users found.</CommandEmpty>
                  <CommandGroup>
                    {filteredMembers.map((user, index) => (
                      <CommandItem
                        key={user.id}
                        className={cn(
                          "flex items-center gap-2 cursor-pointer",
                          index === selectedIndex && "bg-accent"
                        )}
                        onSelect={() => insertMention(user, field.value, field.onChange)}
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={user.image || undefined} />
                          <AvatarFallback className="text-xs">
                            {user.name
                              ? user.name
                                  .split(" ")
                                  .map((word) => word[0])
                                  .slice(0, 2)
                                  .join("")
                              : user.email[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {user.name || user.email}
                          </div>
                          {user.name && (
                            <div className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </div>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          )}
          
          <FormMessage className="ml-2 text-sm" />
        </FormItem>
      )}
    />
  );
}