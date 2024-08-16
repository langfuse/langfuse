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
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { zodResolver } from "@hookform/resolvers/zod";
import { CommentObjectType } from "@langfuse/shared";
import { ArrowUpToLine } from "lucide-react";
import React, { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

const CreateCommentData = z.object({
  projectId: z.string(),
  content: z.string(),
  objectId: z.string(),
  objectType: z.nativeEnum(CommentObjectType),
});

export function CommentList({
  projectId,
  objectId,
  objectType,
  className,
}: {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  className?: string;
}) {
  const comments = api.comments.getByObjectId.useQuery({
    projectId,
    objectId,
    objectType,
  });

  const form = useForm<z.infer<typeof CreateCommentData>>({
    resolver: zodResolver(CreateCommentData),
    defaultValues: {
      content: "",
      projectId,
      objectId,
      objectType,
    },
  });

  const utils = api.useUtils();

  const createCommentMutation = api.comments.create.useMutation({
    onError: (error) => form.setError("content", { message: error.message }),
    onSettled: async () => {
      await Promise.all([utils.comments.invalidate()]);
    },
  });

  const commentsWithFormattedTimestamp = useMemo(() => {
    return comments.data?.map((comment) => ({
      ...comment,
      timestamp: formatCommentTimestamp(comment.timestamp),
    }));
  }, [comments.data]);

  if (comments.isLoading) return null;

  function onSubmit(values: z.infer<typeof CreateCommentData>) {
    createCommentMutation
      .mutateAsync({
        ...values,
      })

      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <div className={cn("rounded-md border", className)}>
      <div className="border-b px-3 py-1 text-sm font-medium">Comments</div>
      <div className="mx-2 mb-2 mt-2 rounded-md border">
        <div className="border-b px-3 py-1 text-xs font-medium">
          Write comment
        </div>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className=""
          >
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="Add comment..."
                      {...field}
                      className="border-none text-xs"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="mr-1 flex justify-end">
              <Button
                type="submit"
                size="xs"
                variant="outline"
                loading={createCommentMutation.isLoading}
                className="mb-1"
              >
                <ArrowUpToLine className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </Form>
      </div>
      {commentsWithFormattedTimestamp?.map((comment) => (
        <div key={comment.id} className="grid grid-cols-[auto,1fr] gap-1 p-2">
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
          <div className="rounded-md border">
            <div className="flex flex-row justify-between border-b px-3 py-1 text-xs font-medium">
              <span>
                {(comment.authorUserName || comment.authorUserId) ?? "User"}
              </span>
              <span>{comment.timestamp}</span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              <div className="flex flex-col">
                <span className="text-xs">{comment.content}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
