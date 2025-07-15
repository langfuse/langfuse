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
import React, { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { type z } from "zod/v4";

export function CommentList({
  projectId,
  objectId,
  objectType,
  cardView = false,
  className,
}: {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  cardView?: boolean;
  className?: string;
}) {
  const session = useSession();
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

  const utils = api.useUtils();

  const createCommentMutation = api.comments.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.comments.invalidate()]);
      form.reset();
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

  if (comments.isLoading)
    return (
      <div
        className={cn(
          "flex min-h-[9rem] items-center justify-center rounded border border-dashed p-2",
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
    <div className={cn(cardView && "rounded-md border", className)}>
      {cardView && (
        <div className="border-b px-3 py-1 text-sm font-medium">Comments</div>
      )}
      {hasWriteAccess && (
        <div className="mx-2 mb-2 mt-2 rounded-md border">
          <div className="flex flex-row border-b px-3 py-1 text-sm">
            <div className="flex-1 text-sm font-medium">New comment</div>
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
                    <FormControl>
                      <Textarea
                        placeholder="Add comment..."
                        {...field}
                        onKeyDown={handleKeyDown} // cmd+enter to submit
                        className="border-none text-sm focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
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
                  title="Submit comment"
                  loading={createCommentMutation.isLoading}
                  onClick={() => {
                    form.handleSubmit(onSubmit)();
                  }}
                  className="absolute bottom-2 right-2"
                >
                  <ArrowUpToLine className="h-3 w-3" />
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}
      <div className="mb-2">
        {commentsWithFormattedTimestamp?.map((comment) => (
          <div
            key={comment.id}
            className="group grid grid-cols-[auto,1fr] gap-1 p-2"
          >
            <Avatar className="mt-1 h-7 w-7">
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
              <div className="flex h-8 flex-row items-center justify-between px-1 py-1 text-sm">
                <div className="text-sm font-medium">
                  {comment.authorUserName ?? comment.authorUserId ?? "User"}
                </div>
                <div className="flex flex-row items-center gap-2">
                  <div className="text-xs text-muted-foreground">
                    {comment.timestamp}
                  </div>
                  <div className="hidden min-h-6 justify-end group-hover:flex">
                    {session.data?.user?.id === comment.authorUserId && (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="destructive"
                        title="Delete comment"
                        loading={deleteCommentMutation.isLoading}
                        className="-mr-2"
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
  );
}
