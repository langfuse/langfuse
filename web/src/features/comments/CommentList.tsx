import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { Textarea } from "@/src/components/ui/textarea";
import { Input } from "@/src/components/ui/input";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { getRelativeTimestampFromNow } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type CommentObjectType,
  CreateCommentData,
  extractMentionedUserIds,
} from "@langfuse/shared";
import { ArrowUpToLine, LoaderCircle, Search, Trash, X } from "lucide-react";
import { useSession } from "next-auth/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { type z } from "zod/v4";
import { useMentionAutocomplete } from "@/src/features/comments/hooks/useMentionAutocomplete";
import { MentionAutocomplete } from "@/src/features/comments/components/MentionAutocomplete";
import { useRouter } from "next/router";

export function CommentList({
  projectId,
  objectId,
  objectType,
  cardView = false,
  className,
  onDraftChange,
  onMentionDropdownChange,
  isDrawerOpen = false,
}: {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  cardView?: boolean;
  className?: string;
  onDraftChange?: (hasDraft: boolean) => void;
  onMentionDropdownChange?: (isOpen: boolean) => void;
  isDrawerOpen?: boolean;
}) {
  const session = useSession();
  const router = useRouter();
  const [textareaKey, setTextareaKey] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [textareaValue, setTextareaValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const commentsContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Extract comment ID from hash for highlighting
  const highlightedCommentId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash;
    if (hash.startsWith("#comment-")) {
      return hash.replace("#comment-", "");
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.asPath]);
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });

  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });

  const hasMembersReadAccess = useHasProjectAccess({
    projectId,
    scope: "projectMembers:read",
  });

  const canTagUsers = hasWriteAccess && hasMembersReadAccess;

  const comments = api.comments.getByObjectId.useQuery(
    {
      projectId,
      objectId,
      objectType,
    },
    { enabled: hasReadAccess && session.status === "authenticated" },
  );

  const form = useForm({
    resolver: zodResolver(CreateCommentData),
    defaultValues: {
      content: "",
      projectId,
      objectId,
      objectType,
    },
  });

  useEffect(() => {
    form.reset({ content: "", projectId, objectId, objectType });
    setTextareaValue("");
    setSearchQuery(""); // Reset search when switching objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, objectType]);

  // Mention autocomplete
  const mentionAutocomplete = useMentionAutocomplete({
    projectId,
    textareaValue,
    cursorPosition,
    enabled: canTagUsers,
  });

  // Notify parent when mention dropdown state changes
  useEffect(() => {
    onMentionDropdownChange?.(mentionAutocomplete.showDropdown);
  }, [mentionAutocomplete.showDropdown, onMentionDropdownChange]);

  const handleTextareaResize = useCallback((target: HTMLTextAreaElement) => {
    // Use requestAnimationFrame for optimal performance
    requestAnimationFrame(() => {
      if (target) {
        target.style.height = "auto";
        const newHeight = Math.min(target.scrollHeight, 100);
        target.style.height = `${newHeight}px`;
      }
    });
  }, []);

  const debouncedResize = useCallback(() => {
    let timeoutId: NodeJS.Timeout;

    const debounced = (target: HTMLTextAreaElement) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => handleTextareaResize(target), 16); // ~60fps
    };

    return {
      resize: debounced,
      cleanup: () => clearTimeout(timeoutId),
    };
  }, [handleTextareaResize]);

  const resizeHandler = useMemo(() => debouncedResize(), [debouncedResize]);

  useEffect(() => {
    return () => {
      resizeHandler.cleanup();
    };
  }, [resizeHandler]);

  // Notify parent when a draft comment exists in the textarea
  const watchedContent = form.watch("content");
  useEffect(() => {
    if (!onDraftChange) return;
    onDraftChange(Boolean(watchedContent && watchedContent.trim().length > 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedContent]);

  // Scroll to bottom when comments initially load to show latest comments + input
  // Skip auto-scroll if there's a highlighted comment (deeplink takes precedence)
  useEffect(() => {
    if (
      comments.data &&
      commentsContainerRef.current &&
      !highlightedCommentId
    ) {
      // Use setTimeout to ensure DOM is fully rendered
      setTimeout(() => {
        if (commentsContainerRef.current) {
          commentsContainerRef.current.scrollTop =
            commentsContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [comments.data, highlightedCommentId]);

  // CMD+F keyboard shortcut to focus search (only when drawer is open)
  useEffect(() => {
    if (!isDrawerOpen) return; // Only capture when drawer is open

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if user is typing in input/textarea
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement &&
          event.target.getAttribute("role") === "textbox")
      ) {
        return;
      }

      // Capture CMD+F or Ctrl+F
      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        event.stopPropagation();
        searchInputRef.current?.focus();
      }
    };

    // Use capture phase to intercept before browser default handler
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isDrawerOpen]);

  const utils = api.useUtils();

  const createCommentMutation = api.comments.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.comments.invalidate()]);
      form.reset();
      setTextareaValue("");
      setTextareaKey((prev) => prev + 1); // Force textarea remount to reset height

      // Scroll to bottom of comments list (newest comment in chronological order)
      if (commentsContainerRef.current) {
        commentsContainerRef.current.scrollTo({
          top: commentsContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    },
  });

  // Insert mention at cursor position
  const insertMention = useCallback(
    (userId: string, displayName: string) => {
      if (!textareaRef.current || mentionAutocomplete.mentionStartPos === null)
        return;

      const textarea = textareaRef.current;
      const currentValue = form.getValues("content");
      const cursorPos = textarea.selectionStart;

      // Replace from @ to cursor with mention
      const before = currentValue.substring(
        0,
        mentionAutocomplete.mentionStartPos,
      );
      const after = currentValue.substring(cursorPos);
      const mention = `@[${displayName}](user:${userId}) `;

      const newText = before + mention + after;
      const newCursorPos = mentionAutocomplete.mentionStartPos + mention.length;

      // Update form value and local state
      form.setValue("content", newText);
      setTextareaValue(newText);

      // Update cursor position
      setTimeout(() => {
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
        setCursorPosition(newCursorPos);
      }, 0);

      // Close dropdown
      mentionAutocomplete.closeDropdown();
    },
    [form, mentionAutocomplete, setTextareaValue],
  );

  const deleteCommentMutation = api.comments.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.comments.invalidate()]);
    },
  });

  const commentsWithFormattedTimestamp = useMemo(() => {
    return comments.data?.map((comment) => ({
      ...comment,
      timestamp: getRelativeTimestampFromNow(comment.createdAt),
    }));
  }, [comments.data]);

  // Client-side filtering based on search query
  const filteredComments = useMemo(() => {
    if (!searchQuery.trim()) return commentsWithFormattedTimestamp;

    const query = searchQuery.toLowerCase();
    return commentsWithFormattedTimestamp?.filter((comment) => {
      const contentMatch = comment.content.toLowerCase().includes(query);
      const authorMatch = (comment.authorUserName || comment.authorUserId || "")
        .toLowerCase()
        .includes(query);
      return contentMatch || authorMatch;
    });
  }, [commentsWithFormattedTimestamp, searchQuery]);

  if (
    !hasReadAccess ||
    (!hasWriteAccess && comments.data?.length === 0) ||
    session.status !== "authenticated"
  )
    return null;

  function onSubmit(values: z.infer<typeof CreateCommentData>) {
    const mentionedUserIds = extractMentionedUserIds(values.content);

    createCommentMutation.mutateAsync({
      ...values,
      mentionedUserIds,
    });
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Cmd+Enter (handle first, before dropdown checks)
    if (event.key === "Enter" && event.metaKey) {
      event.preventDefault();
      form.handleSubmit(onSubmit)();
      return;
    }

    // Handle autocomplete navigation for mentions
    if (!mentionAutocomplete.showDropdown) {
      return;
    }
    if (mentionAutocomplete.users.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const newIndex =
        (mentionAutocomplete.selectedIndex + 1) %
        mentionAutocomplete.users.length;
      mentionAutocomplete.setSelectedIndex(newIndex);
      return;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const newIndex =
        mentionAutocomplete.selectedIndex === 0
          ? mentionAutocomplete.users.length - 1
          : mentionAutocomplete.selectedIndex - 1;
      mentionAutocomplete.setSelectedIndex(newIndex);
      return;
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const user = mentionAutocomplete.users[mentionAutocomplete.selectedIndex];
      if (user) {
        const displayName = user.name || user.email || "User";
        insertMention(user.id, displayName);
      }
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation(); // we don't want the sheet to close
      event.nativeEvent.stopImmediatePropagation(); // stops other event listeners
      mentionAutocomplete.closeDropdown();
      return;
    }
  };

  if (comments.isPending)
    return (
      <div
        className={cn(
          "flex min-h-[5rem] items-center justify-center rounded border border-dashed p-1",
          className,
        )}
      >
        <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground opacity-60">
          Loading comments...
        </span>
      </div>
    );

  return (
    <div
      className={cn(
        cardView && "rounded-md border",
        "flex h-full min-h-0 flex-col",
        className,
      )}
    >
      {cardView && (
        <div className="flex-shrink-0 border-b px-2 py-1 text-sm font-medium">
          Comments ({comments.data?.length ?? 0})
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {!cardView && (
          <div className="flex-shrink-0 border-b">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <div className="text-sm font-medium">Comments</div>
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search comments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-7 pr-7 text-xs"
                />
                {searchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
                {!searchQuery && (
                  <kbd className="pointer-events-none absolute right-1 top-1/2 h-5 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-50 sm:inline-flex">
                    {typeof navigator !== "undefined" &&
                    navigator.platform.toLowerCase().includes("mac") ? (
                      <>
                        <span className="text-xs">⌘</span>F
                      </>
                    ) : (
                      <>Ctrl+F</>
                    )}
                  </kbd>
                )}
              </div>
            </div>
            <div className="px-2 pb-1 text-xs text-muted-foreground">
              {searchQuery.trim()
                ? filteredComments && filteredComments.length > 0
                  ? `Showing ${filteredComments.length} of ${comments.data?.length ?? 0} comments`
                  : "No comments match your search"
                : `${comments.data?.length ?? 0} comments`}
            </div>
          </div>
        )}
        <div
          ref={commentsContainerRef}
          className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto"
        >
          <div className="max-h-full p-1">
            {filteredComments?.map((comment) => (
              <div
                key={comment.id}
                id={`comment-${comment.id}`}
                className={cn(
                  "group grid grid-cols-[auto,1fr] gap-1 rounded-md p-1 transition-colors",
                  highlightedCommentId === comment.id &&
                    "border-2 border-blue-500",
                )}
              >
                <Avatar className="mt-0.5 h-6 w-6">
                  <AvatarImage src={comment.authorUserImage ?? undefined} />
                  <AvatarFallback>
                    {comment.authorUserName
                      ? comment.authorUserName
                          .split(" ")
                          .map((word) => word[0])
                          .slice(0, 2)
                          .concat("")
                      : (comment.authorUserId ?? "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="relative rounded-md">
                  <div className="flex h-6 flex-row items-center justify-between px-1 py-0 text-sm">
                    <div className="text-sm font-medium">
                      {comment.authorUserName ?? comment.authorUserId ?? "User"}
                    </div>
                    <div className="flex flex-row items-center gap-2">
                      <div className="text-xs text-muted-foreground">
                        {comment.timestamp}
                      </div>
                      <div className="hidden min-h-5 justify-end group-hover:flex">
                        {session.data?.user?.id === comment.authorUserId && (
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            title="Delete comment"
                            loading={deleteCommentMutation.isPending}
                            className="-mr-1"
                            onClick={() => {
                              if (
                                confirm(
                                  "Are you sure you want to delete this comment?",
                                )
                              )
                                deleteCommentMutation.mutateAsync({
                                  commentId: comment.id,
                                  projectId,
                                  objectId,
                                  objectType,
                                });
                            }}
                          >
                            <Trash className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <MarkdownView markdown={comment.content} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {hasWriteAccess && (
          <div className="mx-2 my-1 flex-shrink-0 rounded-md border">
            <div className="flex flex-row border-b px-2 py-1 text-xs">
              <div className="flex-1 font-medium">New comment</div>
              <div className="text-xs text-muted-foreground">
                supports markdown
              </div>
            </div>
            <Form {...form}>
              <form className="relative">
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <div className="relative">
                        <FormControl>
                          <Textarea
                            key={textareaKey} // remount textarea to reset height after submission
                            placeholder="Add comment..."
                            {...field}
                            ref={(el) => {
                              if (textareaRef.current !== el) {
                                textareaRef.current = el;
                              }
                              // Call the field ref if it exists (for react-hook-form)
                              if (typeof field.ref === "function") {
                                field.ref(el);
                              }
                            }}
                            onKeyDown={handleKeyDown}
                            className="max-h-[100px] min-h-[2.25rem] w-full resize-none overflow-hidden border-none py-2 pr-7 text-sm leading-tight focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
                            style={{
                              whiteSpace: "pre-wrap",
                              wordWrap: "break-word",
                              overflowWrap: "break-word",
                              height: "auto",
                              minHeight: "2.25rem",
                            }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              resizeHandler.resize(target);
                              setTextareaValue(target.value);
                              setCursorPosition(target.selectionStart);
                            }}
                            onClick={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              setTextareaValue(target.value);
                              setCursorPosition(target.selectionStart);
                            }}
                            onSelect={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              setTextareaValue(target.value);
                              setCursorPosition(target.selectionStart);
                            }}
                            autoFocus
                          />
                        </FormControl>
                        {canTagUsers && mentionAutocomplete.showDropdown && (
                          <MentionAutocomplete
                            users={mentionAutocomplete.users}
                            isLoading={mentionAutocomplete.isLoading}
                            selectedIndex={mentionAutocomplete.selectedIndex}
                            onSelect={insertMention}
                            onClose={mentionAutocomplete.closeDropdown}
                            onSelectedIndexChange={
                              mentionAutocomplete.setSelectedIndex
                            }
                          />
                        )}
                      </div>
                      <FormMessage className="ml-2 text-sm" />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end">
                  <HoverCard openDelay={200}>
                    <HoverCardTrigger asChild>
                      <Button
                        type="submit"
                        size="icon-xs"
                        variant="outline"
                        title="Submit comment"
                        loading={createCommentMutation.isPending}
                        onClick={() => {
                          form.handleSubmit(onSubmit)();
                        }}
                        className="absolute bottom-1 right-1"
                      >
                        <ArrowUpToLine className="h-3 w-3" />
                      </Button>
                    </HoverCardTrigger>
                    <HoverCardContent
                      side="top"
                      align="end"
                      className="w-auto p-2"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span>Send comment</span>
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                          <span className="text-xs">⌘</span>Enter
                        </kbd>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </div>
              </form>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
