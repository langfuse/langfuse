"use client";

import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
  type Placement,
} from "@floating-ui/react";
import { cva } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { useScrollGradients } from "@/src/hooks/useScrollGradients";

const menuVariants = cva(
  "bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 min-w-32 overflow-y-auto rounded-md border shadow-md outline-hidden",
);

const menuBodyVariants = cva(
  "before:from-popover after:from-popover p-1 before:pointer-events-none before:sticky before:z-2 before:-mx-1 before:-mb-6 before:block before:h-6 before:bg-linear-to-b before:to-transparent before:content-[''] after:pointer-events-none after:sticky after:bottom-0 after:z-2 after:-mx-1 after:-mt-6 after:block after:h-6 after:bg-linear-to-t after:to-transparent after:content-['']",
  {
    variants: {
      showTopGradient: {
        true: "before:opacity-100",
        false: "before:opacity-0",
      },
      showBottomGradient: {
        true: "after:opacity-100",
        false: "after:opacity-0",
      },
      hasTitle: {
        true: "before:top-[calc(2.5rem-1px)]",
        false: "before:top-0",
      },
    },
  },
);

const menuItemVariants = cva(
  "focus:bg-accent data-[active]:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 relative flex h-8 min-w-0 cursor-pointer items-center rounded-sm text-sm outline-hidden transition-colors",
);

const primaryActionVariants = cva(
  "flex min-w-0 flex-1 cursor-pointer items-center px-2 py-1.5",
);

const secondaryActionVariants = cva(
  "hover:bg-border dark:hover:bg-white/10 mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded",
);

type MenuAction =
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void };

type DropdownMenuItem = {
  disabled?: { reason: string };
  id: string;
  title: string;
  icon?: LucideIcon;
  type: "item";
  secondaryAction?: MenuAction & {
    ariaLabel: string;
    icon: LucideIcon;
  };
} & MenuAction;

type DropdownMenuItemDefinition =
  | DropdownMenuItem
  | { id: string; type: "loading" }
  | { id: string; type: "separator" };

type DropdownMenuProps = {
  children: (controls: {
    getTriggerProps: () => ReturnType<
      ReturnType<typeof useInteractions>["getReferenceProps"]
    >;
  }) => React.ReactNode;
  items: DropdownMenuItemDefinition[];
  maxHeight?: React.CSSProperties["maxHeight"];
  placement?: Placement;
  title?: string;
};

function DropdownMenu({
  children,
  items,
  maxHeight = "15rem",
  placement = "bottom-start",
  title,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const layerContainer = useLayerContainer("popover");
  const listRef = React.useRef<Array<HTMLElement | null>>([]);
  const labelsRef = React.useRef<Array<string | null>>([]);
  const { register, recompute, top, bottom } =
    useScrollGradients<HTMLDivElement>(true);
  const { context, floatingStyles, refs } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    transform: false,
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const listNavigation = useListNavigation(context, {
    activeIndex,
    listRef,
    loop: true,
    onNavigate: setActiveIndex,
  });
  const typeahead = useTypeahead(context, {
    activeIndex,
    listRef: labelsRef,
    onMatch: setActiveIndex,
  });
  const { getFloatingProps, getItemProps, getReferenceProps } = useInteractions(
    [click, dismiss, role, listNavigation, typeahead],
  );

  return (
    <>
      {children({
        getTriggerProps: () =>
          getReferenceProps({
            ref: refs.setReference,
          }),
      })}
      {isOpen ? (
        <FloatingPortal root={layerContainer}>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={(element) => {
                refs.setFloating(element);
                register(element);
              }}
              className={menuVariants()}
              style={{ ...floatingStyles, maxHeight }}
              {...getFloatingProps({ onScroll: recompute })}
              {...(title
                ? { "aria-label": title, "aria-labelledby": undefined }
                : {})}
            >
              {title ? (
                <div className="border-border bg-popover sticky top-0 z-1 border-b px-3 py-2.5 text-sm font-bold">
                  {title}
                </div>
              ) : null}
              <div
                className={menuBodyVariants({
                  hasTitle: Boolean(title),
                  showBottomGradient: bottom,
                  showTopGradient: top,
                })}
              >
                {items.map((item, index) => {
                  if (item.type === "separator") {
                    labelsRef.current[index] = null;
                    listRef.current[index] = null;
                    return (
                      <div
                        key={item.id}
                        role="separator"
                        className="bg-border -mx-1 my-1 h-px"
                      />
                    );
                  }

                  if (item.type === "loading") {
                    labelsRef.current[index] = null;
                    listRef.current[index] = null;
                    return (
                      <div
                        key={item.id}
                        role="menuitem"
                        aria-label="Loading"
                        aria-disabled="true"
                        className="flex h-8 items-center px-2 py-1.5"
                      >
                        <div className="bg-muted-foreground/20 h-4 w-24 animate-pulse rounded-md" />
                      </div>
                    );
                  }

                  const ItemIcon = item.icon;
                  const SecondaryIcon = item.secondaryAction?.icon;
                  labelsRef.current[index] = item.title;
                  let renderedSecondaryAction: React.ReactNode = null;

                  if (item.secondaryAction && SecondaryIcon) {
                    const secondaryAction = item.secondaryAction;
                    const interactionProps = {
                      onMouseEnter: () => {
                        if (!item.disabled) setActiveIndex(index);
                      },
                      onMouseLeave: () => setActiveIndex(null),
                    };

                    if (secondaryAction.href) {
                      renderedSecondaryAction = (
                        <Link
                          data-secondary-action=""
                          href={secondaryAction.href}
                          aria-label={secondaryAction.ariaLabel}
                          aria-disabled={item.disabled ? "true" : undefined}
                          tabIndex={-1}
                          className={secondaryActionVariants()}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (item.disabled) {
                              event.preventDefault();
                              return;
                            }
                            setIsOpen(false);
                          }}
                          {...interactionProps}
                        >
                          <SecondaryIcon size={12} aria-hidden="true" />
                        </Link>
                      );
                    } else {
                      renderedSecondaryAction = (
                        <button
                          type="button"
                          disabled={Boolean(item.disabled)}
                          data-secondary-action=""
                          aria-label={secondaryAction.ariaLabel}
                          tabIndex={-1}
                          className={secondaryActionVariants()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setIsOpen(false);
                            secondaryAction.onClick?.();
                          }}
                          {...interactionProps}
                        >
                          <SecondaryIcon size={12} aria-hidden="true" />
                        </button>
                      );
                    }
                  }

                  return (
                    <div
                      key={item.id}
                      role="menuitem"
                      tabIndex={activeIndex === index ? 0 : -1}
                      aria-disabled={item.disabled ? "true" : undefined}
                      title={item.disabled?.reason}
                      ref={(element) => {
                        listRef.current[index] = element;
                      }}
                      data-active={activeIndex === index ? "" : undefined}
                      data-disabled={item.disabled ? "" : undefined}
                      className={menuItemVariants()}
                      {...getItemProps({
                        onClick: (event) => {
                          if (item.disabled) return;
                          if (event.target !== event.currentTarget) return;
                          event.preventDefault();
                          event.currentTarget
                            .querySelector<HTMLElement>("[data-primary-action]")
                            ?.click();
                        },
                        onKeyDown: (event) => {
                          if (item.disabled) return;
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== "Enter" && event.key !== " ")
                            return;
                          event.preventDefault();
                          event.currentTarget
                            .querySelector<HTMLElement>("[data-primary-action]")
                            ?.click();
                        },
                      })}
                    >
                      {item.href ? (
                        <Link
                          data-primary-action=""
                          href={item.href}
                          aria-disabled={item.disabled ? "true" : undefined}
                          tabIndex={item.disabled ? -1 : undefined}
                          className={primaryActionVariants()}
                          onClick={(event) => {
                            if (item.disabled) {
                              event.preventDefault();
                              return;
                            }
                            setIsOpen(false);
                          }}
                        >
                          {ItemIcon ? (
                            <ItemIcon
                              className="mr-1.5 size-4"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span
                            className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap"
                            title={item.title}
                          >
                            {item.title}
                          </span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(item.disabled)}
                          data-primary-action=""
                          className={primaryActionVariants()}
                          onClick={() => {
                            setIsOpen(false);
                            item.onClick?.();
                          }}
                        >
                          {ItemIcon ? (
                            <ItemIcon
                              className="mr-1.5 size-4"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span
                            className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap"
                            title={item.title}
                          >
                            {item.title}
                          </span>
                        </button>
                      )}
                      {renderedSecondaryAction}
                    </div>
                  );
                })}
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}

export { DropdownMenu };
