"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import {
  Check,
  ChevronRight,
  Circle,
  Minus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/src/utils/tailwind";
import { useLayerContainer } from "@/src/components/ui/layer";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useScrollGradients } from "@/src/hooks/useScrollGradients";

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

// Route the portal into the `popover` overlay layer (above `modal`). null
// until mounted → falls back to <body>, SSR-parity. Layer order, not z-index,
// stacks it. An explicit `container` prop still overrides the default.
const DropdownMenuPortal = ({
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Portal>) => {
  const container = useLayerContainer("popover");
  return <DropdownMenuPrimitive.Portal container={container} {...props} />;
};
DropdownMenuPortal.displayName = "DropdownMenuPortal";

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
    hasCustomIcon?: boolean;
  }
>(({ className, inset, children, hasCustomIcon = false, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "focus:bg-accent data-[state=open]:bg-accent flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {children}
    {!hasCustomIcon && <ChevronRight className="ml-auto h-4 w-4" />}
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 min-w-32 overflow-hidden rounded-md border p-1 shadow-lg",
      className,
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

const dropdownMenuLabelVariants = cva("px-2 py-1.5 text-sm font-bold");

const dropdownMenuContentVariants = cva(
  "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 min-w-32 overflow-hidden rounded-md border shadow-md",
  {
    variants: {
      // Header content provides its own full-width header and padded body.
      // Headerless content needs the default padding on the Radix container.
      hasHeader: {
        true: null,
        false: "p-1",
      },
    },
  },
);

const dropdownMenuScrollGradientVariants = cva(
  "before:pointer-events-none before:sticky before:z-2 before:-mx-1 before:-mb-6 before:block before:h-6 before:bg-linear-to-b before:from-popover before:to-transparent before:content-[''] after:pointer-events-none after:sticky after:bottom-0 after:z-2 after:-mx-1 after:-mt-6 after:block after:h-6 after:bg-linear-to-t after:from-popover after:to-transparent after:content-['']",
  {
    variants: {
      hasHeader: {
        true: "before:top-[calc(2.5rem-1px)]",
        false: "before:top-0",
      },
      showTopGradient: {
        true: "before:opacity-100",
        false: "before:opacity-0",
      },
      showBottomGradient: {
        true: "after:opacity-100",
        false: "after:opacity-0",
      },
    },
  },
);

type DropdownMenuContentProps = React.ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Content
> & {
  header?: React.ReactNode;
  maxHeight?: React.CSSProperties["maxHeight"];
};

const DropdownContentWrapper = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  Omit<DropdownMenuContentProps, "children"> & {
    children:
      | React.ReactNode
      | ((gradients: { top: boolean; bottom: boolean }) => React.ReactNode);
  }
>(
  (
    { children, className, header, sideOffset = 4, maxHeight, style, ...props },
    ref,
  ) => {
    const container = useLayerContainer("popover");
    const { register, recompute, top, bottom } = useScrollGradients<
      React.ComponentRef<typeof DropdownMenuPrimitive.Content>
    >(maxHeight !== undefined);
    const content =
      typeof children === "function" ? children({ top, bottom }) : children;

    return (
      <DropdownMenuPrimitive.Portal container={container}>
        <DropdownMenuPrimitive.Content
          ref={(element) => {
            register(element);
            if (typeof ref === "function") {
              ref(element);
            } else if (ref) {
              ref.current = element;
            }
          }}
          sideOffset={sideOffset}
          className={cn(
            dropdownMenuContentVariants({
              hasHeader: header != null,
              className,
            }),
            maxHeight !== undefined &&
              header == null &&
              dropdownMenuScrollGradientVariants({
                hasHeader: false,
                showTopGradient: top,
                showBottomGradient: bottom,
              }),
          )}
          style={
            maxHeight === undefined
              ? style
              : { ...style, maxHeight, overflowY: "auto" }
          }
          {...props}
          onScroll={(event) => {
            recompute();
            props.onScroll?.(event);
          }}
        >
          {content}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    );
  },
);
DropdownContentWrapper.displayName = "DropdownContentWrapper";

const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(
  (
    { children, className, header, sideOffset = 4, maxHeight, style, ...props },
    ref,
  ) => {
    if (header != null) {
      // The sticky header sits outside the padded body so its background and
      // border cover the full width of the scroll container.
      return (
        <DropdownContentWrapper
          ref={ref}
          className={className}
          header={header}
          sideOffset={sideOffset}
          maxHeight={maxHeight}
          style={style}
          {...props}
        >
          {({ top, bottom }) => (
            <>
              <div
                className={cn(
                  dropdownMenuLabelVariants(),
                  "border-border bg-popover sticky top-0 z-1 border-b px-3 py-2.5",
                )}
              >
                {header}
              </div>
              <div
                className={cn(
                  "p-1",
                  maxHeight !== undefined &&
                    dropdownMenuScrollGradientVariants({
                      hasHeader: true,
                      showTopGradient: top,
                      showBottomGradient: bottom,
                    }),
                )}
              >
                {children}
              </div>
            </>
          )}
        </DropdownContentWrapper>
      );
    }

    return (
      <DropdownContentWrapper
        ref={ref}
        className={className}
        sideOffset={sideOffset}
        maxHeight={maxHeight}
        style={style}
        {...props}
      >
        {children}
      </DropdownContentWrapper>
    );
  },
);
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

/**
 * Prefer `DropdownMenuItemWithSecondaryAction` for items that do not require JSX content.
 */
const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

type DropdownMenuItemAction =
  | {
      href: React.ComponentProps<typeof Link>["href"];
      onClick?: never;
    }
  | {
      href?: never;
      onClick: () => void;
    };

type DropdownMenuItemWithSecondaryActionProps = {
  icon?: LucideIcon;
  title: string;
  secondaryAction?: DropdownMenuItemAction & {
    ariaLabel?: string;
    icon: LucideIcon;
  };
} & DropdownMenuItemAction;

const dropdownMenuItemPrimaryActionVariants = cva(
  "flex min-w-0 flex-1 cursor-pointer items-center px-2 py-1.5",
);

const dropdownMenuItemSecondaryActionVariants = cva(
  "hover:bg-border dark:hover:bg-white/10 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded mr-1",
);

const DropdownMenuItemWithSecondaryAction = (
  props: DropdownMenuItemWithSecondaryActionProps,
) => {
  const secondaryAction = props.secondaryAction;
  const PrimaryActionIcon = props.icon;
  const SecondaryActionIcon = secondaryAction?.icon;
  const primaryContent = (
    <>
      {PrimaryActionIcon && (
        <PrimaryActionIcon className="mr-1.5 size-4" aria-hidden="true" />
      )}
      <span
        className="max-w-36 overflow-hidden text-ellipsis whitespace-nowrap"
        title={props.title}
      >
        {props.title}
      </span>
    </>
  );
  let secondaryActionContent: React.ReactNode = null;

  if (secondaryAction && SecondaryActionIcon) {
    if (secondaryAction.href !== undefined) {
      secondaryActionContent = (
        <Link
          href={secondaryAction.href}
          aria-label={secondaryAction.ariaLabel}
          className={dropdownMenuItemSecondaryActionVariants()}
          onClick={(event) => event.stopPropagation()}
        >
          <SecondaryActionIcon size={12} />
        </Link>
      );
    } else {
      secondaryActionContent = (
        <button
          type="button"
          aria-label={secondaryAction.ariaLabel}
          className={dropdownMenuItemSecondaryActionVariants()}
          onClick={(event) => {
            event.stopPropagation();
            secondaryAction.onClick();
          }}
        >
          <SecondaryActionIcon size={12} />
        </button>
      );
    }
  }

  return (
    <div className="flex h-8">
      {props.href !== undefined ? (
        <DropdownMenuItem asChild className="h-8 min-w-0 flex-1 p-0">
          <Link
            href={props.href}
            className={dropdownMenuItemPrimaryActionVariants()}
          >
            {primaryContent}
          </Link>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem asChild className="h-8 min-w-0 flex-1 p-0">
          <button
            type="button"
            className={dropdownMenuItemPrimaryActionVariants()}
            onClick={props.onClick}
          >
            {primaryContent}
          </button>
        </DropdownMenuItem>
      )}

      {secondaryActionContent}
    </div>
  );
};

const DropdownMenuLoadingItem = () => (
  <DropdownMenuItem disabled aria-label="Loading">
    <Skeleton variant="contrast" className="h-4 w-24" />
  </DropdownMenuItem>
);

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50",
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        {checked === "indeterminate" && <Minus className="h-4 w-4" />}
        {checked === true && <Check className="h-4 w-4" />}
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(dropdownMenuLabelVariants(), inset && "pl-8", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("bg-border -mx-1 my-1 h-px", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemWithSecondaryAction,
  DropdownMenuLoadingItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
