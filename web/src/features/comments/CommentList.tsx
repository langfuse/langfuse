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
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { Textarea } from "@/src/components/ui/textarea";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { getRelativeTimestampFromNow } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { zodResolver } from "@hookform/resolvers/zod";
import { type CommentObjectType, CreateCommentData } from "@langfuse/shared";
import { ArrowUpToLine, LoaderCircle, Trash } from "lucide-react";
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
import { useTranslation } from "react-i18next";

export function CommentList({
  projectId,
  objectId,
  objectType,
  cardView = false,
  className,
  onDraftChange,
}: {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  cardView?: boolean;
  className?: string;
  onDraftChange?: (hasDraft: boolean) => void;
}) {
  const { t } = useTranslation();
  const session = useSession();
  const [textareaKey, setTextareaKey] = useState(0);
  const commentsContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });

  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, objectType]);

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

  const utils = api.useUtils();

  const createCommentMutation = api.comments.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.comments.invalidate()]);
      form.reset();
      setTextareaKey((prev) => prev + 1); // Force textarea remount to reset height

      // Scroll to top of comments list
      if (commentsContainerRef.current) {
        commentsContainerRef.current.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
    },
  });

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

  if (
    !hasReadAccess ||
    (!hasWriteAccess && comments.data?.length === 0) ||
    session.status !== "authenticated"
  )
    return null;

  function onSubmit(values: z.infer<typeof CreateCommentData>) {
    createCommentMutation.mutateAsync({
      ...values,
    });
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && event.metaKey) {
      event.preventDefault(); // Prevent the default newline behavior
      form.handleSubmit(onSubmit)(); // Submit the form on cmd+enter
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
          {t("common.status.loading")}
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
          {t("comments.commentCount", { count: comments.data?.length ?? 0 })}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={commentsContainerRef}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="p-1">
            {commentsWithFormattedTimestamp?.map((comment) => (
              <div
                key={comment.id}
                className="group grid grid-cols-[auto,1fr] gap-1 p-1"
              >
                <Avatar className="mt-0.5 h-6 w-6">
                  <AvatarImage src={comment.authorUserImage ?? undefined} />
                  <AvatarFallback>
                    {comment.authorUserName
                      ? comment.authorUserName
                          .split(" ")
                          .map((word) => word[0])
                          .slice(0, 2)
                          .join("")
                      : (comment.authorUserId ?? "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="relative rounded-md">
                  <div className="flex h-6 flex-row items-center justify-between px-1 py-0 text-sm">
                    <div className="text-sm font-medium">
                      {comment.authorUserName ??
                        comment.authorUserId ??
                        t("ui.comments.userFallback")}
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
                            title={t("ui.comments.deleteComment")}
                            loading={deleteCommentMutation.isPending}
                            className="-mr-1"
                            onClick={() => {
                              if (confirm(t("ui.comments.deleteConfirmation")))
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
              <div className="flex-1 font-medium">
                {t("ui.comments.newComment")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("ui.comments.supportsMarkdown")}
              </div>
            </div>
            <Form {...form}>
              <form className="relative">
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          key={textareaKey} // remount textarea to reset height after submission
                          placeholder={t("ui.comments.addCommentPlaceholder")}
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
                          }}
                          autoFocus
                        />
                      </FormControl>
                      <FormMessage className="ml-2 text-sm" />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="icon-xs"
                    variant="outline"
                    title={t("ui.comments.submitComment")}
                    loading={createCommentMutation.isPending}
                    onClick={() => {
                      form.handleSubmit(onSubmit)();
                    }}
                    className="absolute bottom-1 right-1"
                  >
                    <ArrowUpToLine className="h-3 w-3" />
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
