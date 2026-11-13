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
  size,
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
import { Check, type IconComponent } from "@langfuse/icons";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/src/utils/tailwind";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { useScrollGradients } from "@/src/hooks/useScrollGradients";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";

const menuVariants = cva(
  "bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 min-w-32 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border shadow-md outline-hidden",
  {
    variants: {
      width: {
        auto: "",
        wide: "w-72",
      },
    },
    defaultVariants: { width: "auto" },
  },
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
        true: "before:top-7.5",
        false: "before:top-0",
      },
    },
  },
);

const menuItemVariants = cva(
  "group/item focus:bg-accent data-[active]:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 relative flex w-full min-w-0 cursor-pointer items-center text-sm outline-hidden",
  {
    variants: {
      noCapture: { true: "ph-no-capture" },
      height: { default: "h-8", auto: "h-auto" },
      radius: { default: "rounded-sm", tile: "rounded-md" },
      variant: {
        default: "",
        entity: "",
        destructive:
          "text-destructive focus:bg-destructive/10 data-[active]:bg-destructive/10",
      },
    },
    defaultVariants: {
      variant: "default",
      height: "default",
      radius: "default",
    },
  },
);

const itemIconTileVariants = cva(
  "bg-muted group-focus/item:bg-border group-data-[active]/item:bg-border mr-3 flex size-9 shrink-0 items-center justify-center rounded-md",
);

const primaryActionVariants = cva(
  "flex min-w-0 flex-1 cursor-pointer items-center pr-2",
  {
    variants: {
      inset: { default: "py-1.5 pl-2", tile: "py-2 pl-2" },
    },
    defaultVariants: { inset: "default" },
  },
);

const secondaryActionVariants = cva(
  "hover:bg-border dark:hover:bg-white/10 mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded",
);

// The negative vertical margin keeps the header at the height the sticky
// scroll gradient below it is offset by.
const headerActionVariants = cva(
  "text-foreground hover:bg-accent hover:text-accent-foreground data-[active]:bg-accent focus-visible:ring-ring -my-0.5 -mr-1.5 flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-sm font-normal outline-hidden focus-visible:ring-1",
);

/** Keeps a separator only between visible rows, never at an edge or doubled. */
function withoutStraySeparators<T extends { type: string }>(items: T[]): T[] {
  return items.filter((item, index) => {
    if (item.type !== "separator") return true;
    const previous = items[index - 1];
    const next = items[index + 1];
    return (
      previous !== undefined &&
      previous.type !== "separator" &&
      next !== undefined &&
      next.type !== "separator"
    );
  });
}

function useStableTriggerRef(
  setReference: ReturnType<typeof useFloating>["refs"]["setReference"],
) {
  return React.useMemo(() => {
    // Stable composed refs avoid detaching the trigger on every prop-getter call.
    const mergedRefs = new WeakMap<
      NonNullable<React.Ref<HTMLElement>>,
      React.RefCallback<HTMLElement>
    >();

    return (callerRef: React.Ref<HTMLElement> | undefined) => {
      if (!callerRef) return setReference;
      const cachedRef = mergedRefs.get(callerRef);
      if (cachedRef) return cachedRef;

      const mergedRef: React.RefCallback<HTMLElement> = (node) => {
        setReference(node);
        if (typeof callerRef === "function") {
          const cleanup = callerRef(node);
          return () => {
            setReference(null);
            if (cleanup) {
              cleanup();
            } else {
              callerRef(null);
            }
          };
        }

        callerRef.current = node;
        return () => {
          setReference(null);
          callerRef.current = null;
        };
      };
      mergedRefs.set(callerRef, mergedRef);
      return mergedRef;
    };
  }, [setReference]);
}

type MenuAction =
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void };

type DropdownMenuItemAction =
  | {
      href: string;
      linkTarget?: "_blank";
      onClick?: never;
      onAfterNavigate?: () => void;
    }
  | {
      href?: never;
      linkTarget?: never;
      onClick: () => void;
      onAfterNavigate?: never;
    };

type SearchBehavior =
  | "default"
  | "hide"
  | "always-show"
  | "show-when-no-results";

type DropdownMenuItem = {
  noCapture?: boolean;
  disabled?: { reason: string };
  id: string;
  title: string;
  tooltip?: string;
  badge?: React.ReactNode;
  icon?: IconComponent;
  /** Shows the icon in a 36px shaded square. */
  iconTile?: boolean;
  /** Muted second line under the title. */
  description?: string;
  /** Shows a trailing tick. */
  selected?: boolean;
  searchBehavior?: SearchBehavior;
  type: "item";
  /** `entity` rows name an org or project; their title is medium weight. */
  variant?: "default" | "entity" | "destructive";
  secondaryAction?: MenuAction & {
    ariaLabel: string;
    icon: IconComponent;
  };
} & DropdownMenuItemAction;

type DropdownMenuCheckboxItem = {
  checked: boolean;
  closeOnCheckedChange?: boolean;
  disabled?: { reason: string };
  id: string;
  title: string;
  icon?: IconComponent;
  searchBehavior?: SearchBehavior;
  onCheckedChange: (checked: boolean) => void;
  type: "checkbox";
};

type DropdownMenuSubmenu = {
  count?: number;
  disabled?: { reason: string };
  id: string;
  title: string;
  internal?: boolean;
  icon?: IconComponent;
  items: DropdownMenuItemDefinition[];
  searchBehavior?: SearchBehavior;
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
  /** Blocks the portaled menu's text and attributes from session replay. */
  noCapture?: boolean;
  children: (controls: {
    getTriggerProps: (
      props?: React.HTMLProps<HTMLElement>,
    ) => ReturnType<ReturnType<typeof useInteractions>["getReferenceProps"]>;
  }) => React.ReactNode;
  items: DropdownMenuItemDefinition[];
  disabled?: boolean;
  /** Shown when no results remain, excluding always-visible actions. */
  emptyText?: string;
  maxHeight?: React.CSSProperties["maxHeight"];
  /** Sizes the menu to the trigger's width, e.g. for a full-width button. */
  matchTriggerWidth?: boolean;
  /** `wide` fixes the menu at 18rem; `auto` sizes it to its content. */
  width?: "auto" | "wide";
  placement?: Placement;
  search?: { placeholder: string };
  title?: string;
  /** Compact link at the right of the header; `tooltip` is also its accessible name. */
  headerAction?: {
    text: string;
    tooltip: string;
    href: string;
    icon?: IconComponent;
  };
  /** Marks an internal-only menu with the Internal badge in the header. */
  internal?: boolean;
  description?: string;
};

/**
 * Prefer the uncontrolled `DropdownMenu`. Use this component only when the
 * caller needs to own the menu's open state.
 */
function ControlledDropdownMenu(
  props: DropdownMenuProps & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  },
) {
  const parentId = useFloatingParentNodeId();
  const stateKey = props.disabled ? "disabled" : "enabled";

  if (parentId === null) {
    return (
      <FloatingTree>
        <DropdownMenuNode
          key={stateKey}
          {...props}
          open={props.open && !props.disabled}
        />
      </FloatingTree>
    );
  }

  return (
    <DropdownMenuNode
      key={stateKey}
      {...props}
      open={props.open && !props.disabled}
    />
  );
}

function DropdownMenuNode({
  ariaLabel,
  noCapture,
  children,
  description,
  disabled = false,
  emptyText,
  headerAction,
  internal = false,
  items,
  maxHeight = "15rem",
  matchTriggerWidth = false,
  width = "auto",
  placement = "bottom-start",
  search,
  title,
  onOpenChange,
  open: isOpen,
}: React.ComponentProps<typeof ControlledDropdownMenu>) {
  const hasHeader = Boolean(title) || internal || Boolean(headerAction);
  const HeaderActionIcon = headerAction?.icon;
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const parentId = useFloatingParentNodeId();
  const nodeId = useFloatingNodeId();
  const tree = useFloatingTree();
  const isNested = parentId !== null;
  const layerContainer = useLayerContainer("popover");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<Array<HTMLElement | null>>([]);
  const labelsRef = React.useRef<Array<string | null>>([]);
  const closeMenu = React.useCallback(() => {
    onOpenChange(false);
    setSearchQuery("");
  }, [onOpenChange]);
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

      onOpenChange(true);
      if (open) tree?.events.emit("menuopen", { nodeId, parentId });
    },
    placement,
    middleware: [
      offset(4),
      flip(),
      shift({ padding: 8, crossAxis: true }),
      ...(matchTriggerWidth
        ? [
            size({
              apply({ rects, elements }) {
                elements.floating.style.width = `${rects.reference.width}px`;
              },
            }),
          ]
        : []),
    ],
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
  const getTriggerRef = useStableTriggerRef(refs.setReference);
  const visibleItems = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!search || !normalizedQuery) return withoutStraySeparators(items);
    const hasDefaultMatch = items.some((item) => {
      if (item.type === "separator" || item.type === "loading") return false;
      if (item.searchBehavior && item.searchBehavior !== "default")
        return false;
      return item.title.toLocaleLowerCase().includes(normalizedQuery);
    });

    const filtered = items.filter((item) => {
      if (item.type === "separator") return true;
      if (item.type === "loading") return true;
      if (item.searchBehavior === "hide") return false;
      if (item.searchBehavior === "always-show") return true;
      if (item.searchBehavior === "show-when-no-results") {
        return !hasDefaultMatch;
      }
      return item.title.toLocaleLowerCase().includes(normalizedQuery);
    });
    return withoutStraySeparators(filtered);
  }, [items, search, searchQuery]);
  // Registered after the items so ArrowUp from the first item wraps to the
  // header action, which sits above them.
  const headerActionIndex = visibleItems.length;
  const setHeaderActionRef = React.useCallback(
    (element: HTMLElement | null) => {
      listRef.current[headerActionIndex] = element;
      labelsRef.current[headerActionIndex] = element
        ? (headerAction?.tooltip ?? null)
        : null;
    },
    [headerAction?.tooltip, headerActionIndex],
  );
  const hasVisibleResults = visibleItems.some(
    (item) =>
      item.type !== "separator" &&
      (item.type === "loading" || item.searchBehavior !== "always-show"),
  );

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
            ref: getTriggerRef(ref),
          });
        },
      })}
      {isOpen ? (
        <FloatingPortal root={layerContainer}>
          <FloatingFocusManager
            context={context}
            modal={false}
            // Searchable menus focus the field so typing filters at once;
            // others keep focus on the trigger and arrow keys move into the list.
            initialFocus={search ? searchInputRef : -1}
          >
            <div
              ref={(element) => {
                refs.setFloating(element);
                register(element);
              }}
              className={menuVariants({
                width,
                className: cn(
                  description && "w-80",
                  noCapture && "ph-no-capture",
                ),
              })}
              style={{ ...floatingStyles, maxHeight }}
              {...getFloatingProps({ onScroll: recompute })}
              {...(ariaLabel || title
                ? {
                    "aria-label": ariaLabel ?? title,
                    "aria-labelledby": undefined,
                  }
                : {})}
            >
              {hasHeader ? (
                <div
                  className={cn(
                    "bg-popover text-muted-foreground sticky top-0 z-1 px-3 pt-2.5 text-xs font-bold",
                    search && "pb-1",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {title}
                      {internal ? (
                        <FeatureReleaseStatus status="internal" />
                      ) : null}
                    </div>
                    {headerAction ? (
                      <Tooltip
                        label={headerAction.tooltip}
                        placement="top"
                        hoverableContent={false}
                      >
                        {({ getTriggerProps }) => (
                          <Link
                            {...getTriggerProps(
                              getItemProps({
                                ref: setHeaderActionRef,
                                onClick: () => tree?.events.emit("click"),
                                onKeyDown: (event) => {
                                  if (event.key !== " ") return;
                                  event.preventDefault();
                                  event.currentTarget.click();
                                },
                              }),
                            )}
                            role="menuitem"
                            tabIndex={
                              activeIndex === headerActionIndex ? 0 : -1
                            }
                            data-active={
                              activeIndex === headerActionIndex ? "" : undefined
                            }
                            href={headerAction.href}
                            aria-label={headerAction.tooltip}
                            className={headerActionVariants()}
                          >
                            {HeaderActionIcon ? (
                              <HeaderActionIcon
                                size="base"
                                color="inherit"
                                aria-hidden
                              />
                            ) : null}
                            {headerAction.text}
                          </Link>
                        )}
                      </Tooltip>
                    ) : null}
                  </div>
                  {description && (
                    <p className="text-muted-foreground mt-1 text-xs font-normal">
                      {description}
                    </p>
                  )}
                </div>
              ) : null}
              {search ? (
                <div
                  className={cn(
                    "border-border bg-popover sticky top-0 z-1 border-b",
                    hasHeader && "border-t",
                  )}
                >
                  <SearchInput
                    ref={searchInputRef}
                    mode="filter"
                    variant="borderless"
                    size="large"
                    value={searchQuery}
                    placeholder={search.placeholder}
                    ariaLabel={search.placeholder}
                    onChange={(value) => {
                      setSearchQuery(value);
                      setActiveIndex(null);
                    }}
                    onBeforeKeyDown={(event) => {
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
                  hasTitle: hasHeader || Boolean(search),
                  showBottomGradient: bottom,
                  showTopGradient: top,
                })}
              >
                {emptyText && !hasVisibleResults ? (
                  <div
                    role="status"
                    className="text-muted-foreground px-2 py-4 text-center text-sm"
                  >
                    {emptyText}
                  </div>
                ) : null}
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
                      <DropdownSubmenu
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
                                  color="default"
                                  __rawClassName="mr-2"
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap">
                                {item.title}
                              </span>
                              {item.internal ? (
                                <FeatureReleaseStatus status="internal" />
                              ) : null}
                              {item.count ? (
                                <span className="ml-2 flex shrink-0 items-center">
                                  <Badge text={String(item.count)} />
                                </span>
                              ) : null}
                              <span className="ml-2 flex">
                                <DropdownIndicator direction="right" />
                              </span>
                            </span>
                          </button>
                        )}
                      </DropdownSubmenu>
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
                              color="default"
                              __rawClassName="mr-2"
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
                  const itemIconNode = ItemIcon ? (
                    <ItemIcon
                      color={
                        item.variant === "destructive" ? "inherit" : "default"
                      }
                      size={item.iconTile ? "base" : undefined}
                      __rawClassName={item.iconTile ? undefined : "mr-2"}
                      aria-hidden="true"
                    />
                  ) : null;
                  const itemContent = (
                    <>
                      {item.iconTile ? (
                        <span className={itemIconTileVariants()}>
                          {itemIconNode}
                        </span>
                      ) : (
                        itemIconNode
                      )}
                      <span className="flex min-w-0 flex-1 flex-col text-left">
                        <span
                          className={cn(
                            "overflow-hidden text-ellipsis whitespace-nowrap",
                            item.variant === "entity" && "font-medium",
                          )}
                          title={item.disabled?.reason ?? item.title}
                        >
                          {item.title}
                        </span>
                        {item.description ? (
                          <span className="text-muted-foreground overflow-hidden text-xs leading-4 text-ellipsis whitespace-nowrap">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      {item.badge ? (
                        <span className="ml-2 shrink-0">{item.badge}</span>
                      ) : null}
                      {item.selected ? (
                        <Check
                          color="default"
                          aria-label="Selected"
                          __rawClassName="ml-2 shrink-0"
                        />
                      ) : null}
                    </>
                  );
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
                          <SecondaryIcon
                            size="sm"
                            color={
                              item.variant === "destructive"
                                ? "inherit"
                                : "default"
                            }
                            aria-hidden="true"
                          />
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
                          <SecondaryIcon
                            size="sm"
                            color={
                              item.variant === "destructive"
                                ? "inherit"
                                : "default"
                            }
                            aria-hidden="true"
                          />
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
                      className={menuItemVariants({
                        variant: item.variant,
                        noCapture: item.noCapture,
                        height:
                          item.iconTile || item.description
                            ? "auto"
                            : "default",
                        radius: item.iconTile ? "tile" : "default",
                      })}
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
                          target={item.linkTarget}
                          rel={
                            item.linkTarget === "_blank"
                              ? "noopener"
                              : undefined
                          }
                          aria-disabled={item.disabled ? "true" : undefined}
                          tabIndex={item.disabled ? -1 : undefined}
                          className={primaryActionVariants({
                            inset: item.iconTile ? "tile" : "default",
                          })}
                          onClick={(event) => {
                            if (item.disabled) {
                              event.preventDefault();
                              return;
                            }
                            tree?.events.emit("click");
                            item.onAfterNavigate?.();
                          }}
                          onAuxClick={(event) => {
                            if (event.button === 1) item.onAfterNavigate?.();
                          }}
                        >
                          {itemContent}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(item.disabled)}
                          data-primary-action=""
                          className={primaryActionVariants({
                            inset: item.iconTile ? "tile" : "default",
                          })}
                          onClick={() => {
                            tree?.events.emit("click");
                            item.onClick?.();
                          }}
                        >
                          {itemContent}
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

function DropdownSubmenu(
  props: Omit<
    React.ComponentProps<typeof ControlledDropdownMenu>,
    "open" | "onOpenChange"
  >,
) {
  const [open, onOpenChange] = React.useState(false);
  return (
    <ControlledDropdownMenu
      {...props}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

export { ControlledDropdownMenu };
