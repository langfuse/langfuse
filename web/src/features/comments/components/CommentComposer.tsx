import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type z } from "zod";
import { type CommentObjectType, CreateCommentData } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/src/components/ui/popover";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { CommentEditor, type CommentEditorHandle } from "./CommentEditor";
import { MentionAutocomplete } from "./MentionAutocomplete";
import { useMentionAutocomplete } from "../hooks/useMentionAutocomplete";
import { MENTION_USER_PREFIX } from "../lib/mentionParser";
import { type SelectionData } from "../contexts/InlineCommentSelectionContext";

export function CommentComposer({
  projectId,
  objectId,
  objectType,
  objectStartTime,
  pendingSelection,
  onSelectionUsed,
  onDraftChange,
  onMentionDropdownChange,
  onCommentCreated,
  isActive = true,
}: {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  objectStartTime?: Date | null;
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
  onMentionDropdownChange?: (isOpen: boolean) => void;
  onCommentCreated: () => void | Promise<void>;
  isActive?: boolean;
}) {
  const editorRef = useRef<CommentEditorHandle>(null);
  const formElementRef = useRef<HTMLFormElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const [cursorAnchor] = useState(() => ({
    getBoundingClientRect: () =>
      editorRef.current?.getCursorRect() ?? new DOMRect(),
  }));
  const attachForm = useCallback((node: HTMLFormElement | null) => {
    formElementRef.current = node;
    if (node) setPortalContainer(node.closest<HTMLElement>('[role="dialog"]'));
  }, []);
  const hasMembersReadAccess = useHasProjectAccess({
    projectId,
    scope: "projectMembers:read",
  });
  const form = useForm({
    resolver: zodResolver(CreateCommentData),
    defaultValues: { content: "", projectId, objectId, objectType },
  });
  const mentions = useMentionAutocomplete({
    projectId,
    enabled: hasMembersReadAccess,
    onOpenChange: onMentionDropdownChange,
  });

  const { showDropdown, closeDropdown } = mentions;

  // Window capture runs before the overlay's document-level Escape handler.
  useEffect(() => {
    if (!showDropdown || !isActive) return;
    function dismissMentions(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDropdown();
    }
    window.addEventListener("keydown", dismissMentions, true);
    return () => window.removeEventListener("keydown", dismissMentions, true);
  }, [showDropdown, closeDropdown, isActive]);

  const createComment = api.comments.create.useMutation({
    onSuccess: async () => {
      form.reset();
      onDraftChange?.(false);
      mentions.closeDropdown();
      onSelectionUsed?.();
      await onCommentCreated();
      const element = formElementRef.current;
      if (
        element?.isConnected &&
        !element.closest('[inert], [hidden], [data-state="closed"]')
      )
        editorRef.current?.focus();
    },
  });

  function submit(values: z.infer<typeof CreateCommentData>) {
    if (createComment.isPending) return;
    createComment.mutate({
      ...values,
      objectStartTime: objectStartTime ?? undefined,
      dataField: pendingSelection?.dataField,
      path: pendingSelection?.path,
      rangeStart: pendingSelection?.rangeStart,
      rangeEnd: pendingSelection?.rangeEnd,
    });
  }

  function insertMention(userId: string, displayName: string) {
    const editor = editorRef.current;
    if (!editor || mentions.mentionStartPos === null) return;
    editor.replaceRange(
      mentions.mentionStartPos,
      editor.getCursorPosition(),
      `@[${displayName}](${MENTION_USER_PREFIX}${userId}) `,
    );
    mentions.closeDropdown();
    editor.focus();
  }

  function handleKeyDown(event: KeyboardEvent): boolean {
    if (event.isComposing) return false;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      form.handleSubmit(submit)();
      return true;
    }
    if (!mentions.showDropdown) return false;
    if (event.key === "Escape") {
      event.stopPropagation();
      event.stopImmediatePropagation();
      mentions.closeDropdown();
      return true;
    }
    if (!mentions.users.length) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      mentions.setSelectedIndex(
        (mentions.selectedIndex + direction + mentions.users.length) %
          mentions.users.length,
      );
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const user = mentions.users[mentions.selectedIndex];
      if (user) insertMention(user.id, user.name || user.email || "User");
      return true;
    }
    return false;
  }

  return (
    <Form {...form}>
      <form
        ref={attachForm}
        inert={!isActive}
        className="flex min-w-0 flex-col gap-3"
        onSubmit={form.handleSubmit(submit)}
      >
        {pendingSelection && (
          <p className="text-muted-foreground text-xs">
            Commenting on selected {pendingSelection.dataField} text
          </p>
        )}
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <CommentEditor
                  ref={editorRef}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    onDraftChange?.(value.trim().length > 0);
                  }}
                  onCursorChange={(position) =>
                    mentions.updateQuery(form.getValues("content"), position)
                  }
                  onKeyDown={handleKeyDown}
                  disabled={createComment.isPending}
                  autoFocus={isActive}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Popover
          open={isActive && mentions.showDropdown}
          onOpenChange={(open) => {
            if (!open) mentions.closeDropdown();
          }}
        >
          <PopoverAnchor virtualRef={{ current: cursorAnchor }} />
          <PopoverContent
            portalContainer={portalContainer}
            align="start"
            sideOffset={6}
            className="w-72 min-w-0 p-1"
            updatePositionStrategy="always"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <MentionAutocomplete
              users={mentions.users}
              isLoading={mentions.isLoading}
              selectedIndex={mentions.selectedIndex}
              onSelect={insertMention}
              onSelectedIndexChange={mentions.setSelectedIndex}
            />
          </PopoverContent>
        </Popover>
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            {hasMembersReadAccess
              ? "Markdown and @mentions supported"
              : "Markdown supported"}
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-muted-foreground hidden sm:inline-flex">
              <KeyboardShortcut keys={["Mod", "Enter"]} />
            </span>
            <Button
              type="submit"
              loading={createComment.isPending}
              disabled={!form.watch("content").trim()}
            >
              Comment
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
