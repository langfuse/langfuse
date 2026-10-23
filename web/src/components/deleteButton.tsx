/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger, @repo/component-file-structure */
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { LockIcon, TrashIcon } from "@langfuse/icons";
import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { useHasProjectAccess } from "@/src/features/rbac";
import { type ProjectScope } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";

export type DeleteButtonProps = {
  itemId: string;
  projectId: string;
  isTableAction?: boolean;
  scope?: ProjectScope;
  invalidateFunc?: () => void;
  redirectUrl?: string;
  deleteConfirmation?: string;
  icon?: boolean;
  enabled?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  title?: string;
  className?: string;
  // forwarded explicitly because the base component does not spread unknown
  // props onto the rendered button
  "aria-label"?: string;
};

type BaseDeleteButtonProps = Omit<DeleteButtonProps, "itemId"> & {
  variant?: ButtonProps["variant"];
  scope: NonNullable<DeleteButtonProps["scope"]>;
  invalidateFunc: NonNullable<DeleteButtonProps["invalidateFunc"]>;
  captureDeleteOpen: (
    capture: ReturnType<typeof usePostHogClientCapture>,
    isTableAction: boolean,
  ) => void;
  captureDeleteSuccess: (
    capture: ReturnType<typeof usePostHogClientCapture>,
    isTableAction: boolean,
  ) => void;
  entityToDeleteName: string;
  customDeletePrompt?: string;
  executeDeleteMutation: (onSuccess: () => void) => Promise<void>;
  isDeleteMutationLoading: boolean;
  itemId?: string;
  // when set, the popover explains why deletion is blocked instead of asking for confirmation
  deleteBlocker?: React.ReactNode;
  onPopoverOpenChange?: (open: boolean) => void;
};

export function DeleteButton({
  variant,
  itemId,
  projectId,
  isTableAction = false,
  scope,
  invalidateFunc,
  redirectUrl,
  deleteConfirmation,
  icon = false,
  enabled = true,
  title,
  className,
  size,
  captureDeleteOpen,
  captureDeleteSuccess,
  entityToDeleteName,
  executeDeleteMutation,
  isDeleteMutationLoading,
  customDeletePrompt,
  deleteBlocker,
  onPopoverOpenChange,
  "aria-label": ariaLabel,
}: BaseDeleteButtonProps) {
  const [isDeleted, setIsDeleted] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const capture = usePostHogClientCapture();

  const hasAccess = useHasProjectAccess({ projectId, scope: scope });

  const onDeleteSuccess = useMemo(() => {
    return () => {
      setIsDeleted(true);
      captureDeleteSuccess(capture, isTableAction);
      !isTableAction && redirectUrl
        ? router.push(redirectUrl)
        : invalidateFunc();
    };
  }, [
    isTableAction,
    redirectUrl,
    invalidateFunc,
    router,
    captureDeleteSuccess,
    capture,
  ]);

  if (!deleteBlocker) {
    return (
      <ConfirmationDialogController
        title={`Delete ${entityToDeleteName}?`}
        text={
          customDeletePrompt ??
          `This action cannot be undone. It removes all the data associated with this ${entityToDeleteName}. If this is the project default, it will be deleted for all users.`
        }
        confirmationText={deleteConfirmation}
        confirmLabel={`Delete ${entityToDeleteName}`}
        variant="destructive"
        loading={isDeleteMutationLoading || isDeleted}
        onConfirm={() => executeDeleteMutation(onDeleteSuccess)}
      >
        {({ openDialog }) =>
          icon ? (
            <IconOnlyButton
              icon={<TrashIcon size="base" />}
              label={title ?? "Delete"}
              aria-label={ariaLabel ?? "delete"}
              disabledReason={
                hasAccess
                  ? undefined
                  : `You don't have permission to delete this ${entityToDeleteName}.`
              }
              variant={variant ?? "outline"}
              size={size ?? "icon"}
              className={className}
              disabled={!enabled}
              onClick={(event) => {
                event.stopPropagation();
                captureDeleteOpen(capture, isTableAction);
                onPopoverOpenChange?.(true);
                openDialog();
              }}
            />
          ) : (
            <Button
              variant={variant ?? "ghost"}
              size={size ?? "default"}
              title={title}
              aria-label={ariaLabel}
              className={className}
              disabled={!hasAccess || !enabled}
              onClick={(event) => {
                event.stopPropagation();
                captureDeleteOpen(capture, isTableAction);
                onPopoverOpenChange?.(true);
                openDialog();
              }}
            >
              {hasAccess ? (
                <TrashIcon size="base" color="default" __rawClassName="mr-2" />
              ) : (
                <LockIcon size="base" color="default" __rawClassName="mr-2" />
              )}
              Delete
            </Button>
          )
        }
      </ConfirmationDialogController>
    );
  }

  return (
    <Popover
      key={itemId ?? "delete-action"}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        onPopoverOpenChange?.(o);
      }}
    >
      {icon ? (
        // Icon-only: a compact button with a built-in tooltip; the popover is
        // opened from onClick since the tooltip wrapper can't be a trigger.
        <PopoverAnchor asChild>
          <span className="inline-flex">
            <IconOnlyButton
              icon={<TrashIcon size="base" />}
              label={title ?? "Delete"}
              aria-label={ariaLabel ?? "delete"}
              disabledReason={
                hasAccess
                  ? undefined
                  : `You don't have permission to delete this ${entityToDeleteName}.`
              }
              variant={variant ?? "outline"}
              size={size ?? "icon"}
              className={className}
              disabled={!enabled}
              onClick={(e) => {
                e.stopPropagation();
                captureDeleteOpen(capture, isTableAction);
                // Opening via controlled state (PopoverAnchor, not
                // PopoverTrigger) means Radix never echoes onOpenChange, so
                // notify consumers explicitly.
                setOpen(true);
                onPopoverOpenChange?.(true);
              }}
            />
          </span>
        </PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>
          <Button
            variant={variant ?? "ghost"}
            size={size ?? "default"}
            title={title}
            aria-label={ariaLabel}
            className={className}
            disabled={!hasAccess || !enabled}
            onClick={(e) => {
              e.stopPropagation();
              captureDeleteOpen(capture, isTableAction);
            }}
          >
            {hasAccess ? (
              <TrashIcon size="base" color="default" __rawClassName="mr-2" />
            ) : (
              <LockIcon size="base" color="default" __rawClassName="mr-2" />
            )}
            Delete
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent onClick={(e) => e.stopPropagation()}>
        {deleteBlocker}
      </PopoverContent>
    </Popover>
  );
}
