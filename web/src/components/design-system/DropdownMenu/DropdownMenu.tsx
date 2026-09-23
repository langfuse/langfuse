"use client";

import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingNode,
  FloatingPortal,
  FloatingTree,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFloatingNodeId,
  useFloatingParentNodeId,
  useFloatingTree,
  useHover,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
  type Placement,
} from "@floating-ui/react";
import { cva } from "class-variance-authority";
import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { useScrollGradients } from "@/src/hooks/useScrollGradients";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";

const menuVariants = cva(
  "bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 min-w-32 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border shadow-md outline-hidden",
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
  "focus:bg-accent data-[active]:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 relative flex h-8 w-full min-w-0 cursor-pointer items-center rounded-sm text-sm outline-hidden transition-colors",
  {
    variants: {
      variant: {
        default: "",
        destructive:
          "text-destructive focus:bg-destructive/10 data-[active]:bg-destructive/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const primaryActionVariants = cva(
  "flex min-w-0 flex-1 cursor-pointer items-center px-2 py-1.5",
);

const secondaryActionVariants = cva(
  "hover:bg-border dark:hover:bg-white/10 mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded",
);

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref) {
        ref.current = value;
      }
    });
  };
}

type MenuAction =
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void };

type DropdownMenuItem = {
  disabled?: { reason: string };
  id: string;
  title: string;
  tooltip?: string;
  icon?: LucideIcon;
  type: "item";
  variant?: "default" | "destructive";
  secondaryAction?: MenuAction & {
    ariaLabel: string;
    icon: LucideIcon;
  };
} & MenuAction;

type DropdownMenuCheckboxItem = {
  checked: boolean;
  closeOnCheckedChange?: boolean;
  disabled?: { reason: string };
  id: string;
  title: string;
  icon?: LucideIcon;
  onCheckedChange: (checked: boolean) => void;
  type: "checkbox";
};

type DropdownMenuSubmenu = {
  disabled?: { reason: string };
  id: string;
  title: string;
  icon?: LucideIcon;
  items: DropdownMenuItemDefinition[];
  search?: { placeholder: string };
  type: "submenu";
};

export type DropdownMenuItemDefinition =
  | DropdownMenuItem
  | DropdownMenuCheckboxItem
  | DropdownMenuSubmenu
  | { id: string; type: "loading" }
  | { id: string; type: "separator" };

type DropdownMenuProps = {
  ariaLabel?: string;
  children: (controls: {
    getTriggerProps: (
      props?: React.HTMLProps<HTMLElement>,
    ) => ReturnType<ReturnType<typeof useInteractions>["getReferenceProps"]>;
  }) => React.ReactNode;
  items: DropdownMenuItemDefinition[];
  disabled?: boolean;
  maxHeight?: React.CSSProperties["maxHeight"];
  placement?: Placement;
  search?: { placeholder: string };
  title?: string;
};

function DropdownMenu(props: DropdownMenuProps) {
  const parentId = useFloatingParentNodeId();
  const stateKey = props.disabled ? "disabled" : "enabled";

  if (parentId === null) {
    return (
      <FloatingTree>
        <DropdownMenuNode key={stateKey} {...props} />
      </FloatingTree>
    );
  }

  return <DropdownMenuNode key={stateKey} {...props} />;
}

function DropdownMenuNode({
  ariaLabel,
  children,
  disabled = false,
  items,
  maxHeight = "15rem",
  placement = "bottom-start",
  search,
  title,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const parentId = useFloatingParentNodeId();
  const nodeId = useFloatingNodeId();
  const tree = useFloatingTree();
  const isNested = parentId !== null;
  const layerContainer = useLayerContainer("popover");
  const listRef = React.useRef<Array<HTMLElement | null>>([]);
  const labelsRef = React.useRef<Array<string | null>>([]);
  const closeMenu = React.useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
  }, []);
  const { register, recompute, top, bottom } =
    useScrollGradients<HTMLDivElement>(true);
  const { context, floatingStyles, refs } = useFloating({
    nodeId,
    open: isOpen,
    onOpenChange: (open) => {
      if (disabled) return;
      if (!open) {
        closeMenu();
        return;
      }

      setIsOpen(true);
      if (open) tree?.events.emit("menuopen", { nodeId, parentId });
    },
    placement,
    middleware: [offset(4), flip(), shift({ padding: 8, crossAxis: true })],
    transform: false,
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context, { enabled: !disabled });
  const hover = useHover(context, {
    enabled: isNested && !disabled,
    delay: { open: 75, close: 100 },
    handleClose: safePolygon({ blockPointerEvents: true }),
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const listNavigation = useListNavigation(context, {
    activeIndex,
    listRef,
    loop: true,
    nested: isNested,
    onNavigate: setActiveIndex,
  });
  const typeahead = useTypeahead(context, {
    activeIndex,
    listRef: labelsRef,
    onMatch: setActiveIndex,
  });
  const { getFloatingProps, getItemProps, getReferenceProps } = useInteractions(
    [click, hover, dismiss, role, listNavigation, typeahead],
  );
  const visibleItems = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!search || !normalizedQuery) return items;

    return items.filter((item) => {
      if (item.type === "separator") return false;
      if (item.type === "loading") return true;
      return item.title.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [items, search, searchQuery]);

  React.useEffect(() => {
    const handleTreeClick = closeMenu;
    const handleMenuOpen = (event: {
      nodeId: string | number;
      parentId: string | number | null;
    }) => {
      if (event.nodeId !== nodeId && event.parentId === parentId) {
        closeMenu();
      }
    };

    tree?.events.on("click", handleTreeClick);
    tree?.events.on("menuopen", handleMenuOpen);
    return () => {
      tree?.events.off("click", handleTreeClick);
      tree?.events.off("menuopen", handleMenuOpen);
    };
  }, [closeMenu, nodeId, parentId, tree]);

  return (
    <FloatingNode id={nodeId}>
      {children({
        getTriggerProps: (props = {}) => {
          const { ref, ...triggerProps } = props;
          return getReferenceProps({
            ...triggerProps,
            "aria-expanded": isOpen,
            ref: mergeRefs(ref, refs.setReference),
          });
        },
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
              {...(ariaLabel || title
                ? {
                    "aria-label": ariaLabel ?? title,
                    "aria-labelledby": undefined,
                  }
                : {})}
            >
              {title ? (
                <div className="border-border bg-popover sticky top-0 z-1 border-b px-3 py-2.5 text-sm font-bold">
                  {title}
                </div>
              ) : null}
              {search ? (
                <div className="border-border bg-popover sticky top-0 z-1 border-b p-1.5">
                  <input
                    type="search"
                    value={searchQuery}
                    placeholder={search.placeholder}
                    aria-label={search.placeholder}
                    className="border-input bg-background focus:ring-ring h-8 w-full rounded-md border px-2 text-sm outline-hidden focus:ring-1"
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setActiveIndex(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        closeMenu();
                        event.preventDefault();
                      } else if (event.key === "ArrowDown") {
                        const firstIndex = listRef.current
                          .slice(0, visibleItems.length)
                          .findIndex((element) => element !== null);
                        setActiveIndex(firstIndex === -1 ? null : firstIndex);
                        listRef.current[firstIndex]?.focus();
                        event.preventDefault();
                      } else if (event.key === "ArrowUp") {
                        const lastIndex = listRef.current
                          .slice(0, visibleItems.length)
                          .findLastIndex((element) => element !== null);
                        setActiveIndex(lastIndex === -1 ? null : lastIndex);
                        listRef.current[lastIndex]?.focus();
                        event.preventDefault();
                      }

                      event.stopPropagation();
                    }}
                  />
                </div>
              ) : null}
              <div
                className={menuBodyVariants({
                  hasTitle: Boolean(title || search),
                  showBottomGradient: bottom,
                  showTopGradient: top,
                })}
              >
                {visibleItems.map((item, index) => {
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

                  if (item.type === "submenu") {
                    const ItemIcon = item.icon;
                    labelsRef.current[index] = item.title;

                    return (
                      <DropdownMenu
                        key={item.id}
                        items={item.items}
                        disabled={Boolean(item.disabled)}
                        maxHeight={maxHeight}
                        placement="right-start"
                        ariaLabel={item.title}
                        search={item.search}
                      >
                        {({ getTriggerProps }) => (
                          <button
                            type="button"
                            role="menuitem"
                            disabled={Boolean(item.disabled)}
                            aria-disabled={item.disabled ? "true" : undefined}
                            title={item.disabled?.reason}
                            tabIndex={activeIndex === index ? 0 : -1}
                            data-active={activeIndex === index ? "" : undefined}
                            data-disabled={item.disabled ? "" : undefined}
                            className={menuItemVariants()}
                            {...getItemProps(
                              getTriggerProps({
                                ref: (element) => {
                                  listRef.current[index] = element;
                                },
                              }),
                            )}
                          >
                            <span className={primaryActionVariants()}>
                              {ItemIcon ? (
                                <ItemIcon
                                  className="mr-1.5 size-4"
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap">
                                {item.title}
                              </span>
                              <ChevronRight
                                className="ml-2 size-4"
                                aria-hidden="true"
                              />
                            </span>
                          </button>
                        )}
                      </DropdownMenu>
                    );
                  }

                  if (item.type === "checkbox") {
                    const ItemIcon = item.icon;
                    labelsRef.current[index] = item.title;
                    const handleCheckedChange = (checked: boolean) => {
                      if (item.disabled) return;
                      if (item.closeOnCheckedChange) {
                        tree?.events.emit("click");
                      }
                      item.onCheckedChange(checked);
                    };

                    return (
                      <div
                        key={item.id}
                        role="menuitemcheckbox"
                        aria-checked={item.checked}
                        aria-disabled={item.disabled ? "true" : undefined}
                        title={item.disabled?.reason}
                        tabIndex={activeIndex === index ? 0 : -1}
                        ref={(element) => {
                          listRef.current[index] = element;
                        }}
                        data-active={activeIndex === index ? "" : undefined}
                        data-disabled={item.disabled ? "" : undefined}
                        className={menuItemVariants()}
                        {...getItemProps({
                          onClick: () => {
                            handleCheckedChange(!item.checked);
                          },
                          onKeyDown: (event) => {
                            if (item.disabled) return;
                            if (event.key !== "Enter" && event.key !== " ")
                              return;
                            event.preventDefault();
                            handleCheckedChange(!item.checked);
                          },
                        })}
                      >
                        <span className={primaryActionVariants()}>
                          {ItemIcon ? (
                            <ItemIcon
                              className="mr-1.5 size-4"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap">
                            {item.title}
                          </span>
                          <span className="ml-2 flex shrink-0 items-center">
                            <Checkbox
                              aria-hidden="true"
                              checked={item.checked}
                              disabled={Boolean(item.disabled)}
                              size="sm"
                              tabIndex={-1}
                              onClick={(event) => event.stopPropagation()}
                              onCheckedChange={handleCheckedChange}
                            />
                          </span>
                        </span>
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
                            tree?.events.emit("click");
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
                            tree?.events.emit("click");
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
                      title={item.disabled?.reason ?? item.tooltip}
                      ref={(element) => {
                        listRef.current[index] = element;
                      }}
                      data-active={activeIndex === index ? "" : undefined}
                      data-disabled={item.disabled ? "" : undefined}
                      className={menuItemVariants({ variant: item.variant })}
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
                            tree?.events.emit("click");
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
                            tree?.events.emit("click");
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
    </FloatingNode>
  );
}

export { DropdownMenu };
