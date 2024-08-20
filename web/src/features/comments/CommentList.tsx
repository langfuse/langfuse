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
import { Textarea } from "@/src/components/ui/textarea";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { zodResolver } from "@hookform/resolvers/zod";
import { type CommentObjectType, CreateCommentData } from "@langfuse/shared";
import { ArrowUpToLine, LoaderCircle, Trash } from "lucide-react";
import { useSession } from "next-auth/react";
import React, { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { type z } from "zod";

const formatCommentTimestamp = (timestamp: Date): string => {
  const diffInMs = new Date().getTime() - timestamp.getTime();
  const diffInMinutes = diffInMs / (1000 * 60);
  const diffInHours = diffInMinutes / 60;
  const diffInDays = diffInHours / 24;

  if (diffInHours < 1) {
    return `${Math.floor(diffInMinutes)} minutes ago`;
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)} hours ago`;
  } else if (diffInDays < 7) {
    return `${Math.floor(diffInDays)} days ago`;
  } else {
    return timestamp.toLocaleDateString("en-US", {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
    });
  }
};

export function CommentList({
  projectId,
  objectId,
  objectType,
  isVisible,
  cardView = false,
  className,
}: {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  isVisible: boolean;
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
    { enabled: hasReadAccess && isVisible },
  );

  const form = useForm<z.infer<typeof CreateCommentData>>({
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
    onError: (error) => form.setError("content", { message: error.message }),
    onSettled: async () => {
      await Promise.all([utils.comments.invalidate()]);
      form.reset();
    },
  });

  const deleteCommentMutation = api.comments.delete.useMutation({
    onSettled: async () => {
      await Promise.all([utils.comments.invalidate()]);
    },
  });

  const commentsWithFormattedTimestamp = useMemo(() => {
    return comments.data?.map((comment) => ({
      ...comment,
      timestamp: formatCommentTimestamp(comment.createdAt),
    }));
  }, [comments.data]);

  if (!hasReadAccess || (!hasWriteAccess && comments.data?.length === 0))
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
        <span className="text-xs text-muted-foreground opacity-60">
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
          <div className="border-b px-3 py-1 text-xs font-medium">
            New comment
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
                        className="border-none text-xs focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
                      />
                    </FormControl>
                    <FormMessage className="ml-2 text-xs" />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="xs"
                  variant="outline"
                  loading={createCommentMutation.isLoading}
                  className="absolute bottom-2 right-2"
                >
                  <ArrowUpToLine className="h-4 w-4" />
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
                  : comment.authorUserId ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="relative rounded-md border">
              <div className="flex h-8 flex-row items-center justify-between border-b px-3 py-1 text-xs font-medium">
                <div>
                  {comment.authorUserName ?? comment.authorUserId ?? "User"}
                </div>
                <div className="flex flex-row items-center gap-2">
                  <div>{comment.timestamp}</div>
                  <div className="hidden min-h-6 justify-end group-hover:flex">
                    {session.data?.user?.id === comment.authorUserId && (
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive-secondary"
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
              <div className="mx-3 my-3 select-text whitespace-pre-wrap text-xs">
                {comment.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
