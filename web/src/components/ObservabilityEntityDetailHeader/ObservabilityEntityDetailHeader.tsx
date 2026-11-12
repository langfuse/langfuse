import { useLayoutEffect, useRef, useState } from "react";
import type PageHeader from "@/src/components/layouts/page-header";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { ControlledDropdownMenu } from "@/src/components/design-system/ControlledDropdownMenu/ControlledDropdownMenu";
import { HeaderActionButton } from "@/src/components/HeaderActionButton";
import { EntityTitle } from "@/src/components/EntityTitle";
import { EntityTitleTabs } from "@/src/components/EntityTitleTabs";
import { useElementSize } from "@/src/hooks/useElementSize";
import { staleProps } from "@/src/features/traces/fns/staleProps";
import { cn } from "@/src/utils/tailwind";
import {
  type IconComponent,
  Search,
  MoreVertical,
  X,
  Loader2,
} from "@langfuse/icons";
import { assertUnreachable } from "@/src/utils/types";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Metric } from "@/src/components/design-system/Metric/Metric";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { ScoreBadge } from "@/src/components/ScoreBadge/ScoreBadge";
import { CorrectionBadge } from "@/src/features/traces/components/CorrectionBadge";
import { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { OverflowCountBadge } from "@/src/components/OverflowCountBadge";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { FloatingController } from "@/src/components/design-system/FloatingController/FloatingController";
import { Skeleton } from "@/src/components/ui/skeleton";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { CostBadge } from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { UsageCostWarningBadge } from "@/src/features/traces/components/UsageCostWarningBadge";

export type HeaderMetric = {
  id: string;
  remove?: { label: string; onClick: () => void };
} & (
  | {
      type: "action";
      label: string;
      icon: IconComponent;
      onClick: () => void;
      triggerRef?: React.Ref<HTMLElement>;
    }
  | ({ searchText: string; overflowOnly?: boolean } & (
      | ({ type: "value" } & Pick<
          React.ComponentProps<typeof Badge>,
          "text" | "label" | "title" | "leadingIcon"
        > & {
            /** Renders a coloured `Badge` (tags, topics) instead of a `Metric`. */
            color?: React.ComponentProps<typeof Badge>["color"];
          })
      | {
          type: "link";
          href: NonNullable<React.ComponentProps<typeof Metric>["href"]>;
          text: string;
          label?: string;
          newTab?: boolean;
        }
      | ({ type: "score" } & Pick<
          React.ComponentProps<typeof ScoreBadge>,
          "name" | "scores"
        >)
      | { type: "correction" }
      | {
          type: "cost";
          text: string;
          title?: string;
          details: React.ComponentProps<typeof BreakdownTooltip>["details"];
          costSource?: React.ComponentProps<
            typeof BreakdownTooltip
          >["costSource"];
          priceSource?: React.ComponentProps<
            typeof BreakdownTooltip
          >["priceSource"];
        }
      | { type: "missing-cost"; projectId: string; hasUsage: boolean }
      | { type: "missing-usage"; projectId: string }
      | { type: "model"; model: string; onCreate: () => void }
      | {
          type: "tokens";
          text: string;
          title?: string;
          details: React.ComponentProps<typeof BreakdownTooltip>["details"];
        }
      | {
          type: "details";
          text: string;
          title: string;
          href: string;
          linkText: string;
          rows: {
            id: string;
            label: string;
            value: string;
            description?: string;
            color?: React.ComponentProps<typeof Badge>["color"];
          }[];
        }
    ))
);

type EntityDetailHeaderTitleProps = Pick<
  React.ComponentProps<typeof PageHeader>,
  "title" | "itemType" | "titleTabs" | "titleTooltip" | "titleBadges"
> & {
  titleLevel?: React.ComponentProps<typeof EntityTitle>["level"];
};

export type EntityDetailHeaderProps = EntityDetailHeaderTitleProps & {
  actions?: readonly EntityDetailHeaderAction[];
};

type EntityDetailHeaderActionContext = {
  layout: "toolbar";
  iconOnly: boolean;
};

export type EntityDetailHeaderAction = {
  id: string;
  /** Pinned controls remain visible when the other actions move into overflow. */
  pinned?: boolean;
} & (
  | {
      type: "button";
      label: string;
      icon: IconComponent;
      iconOnly?: boolean;
      disabled?: boolean;
      count?: number;
      isLoading?: boolean;
      onClick: () => void;
    }
  | {
      type: "dropdown";
      placement?: "trailing";
      label: string;
      icon: IconComponent;
      iconOnly?: boolean;
      disabled?: boolean;
      items: DropdownMenuItemDefinition[];
      count?: number;
    }
  | {
      type: "checkbox";
      label: string;
      checked: boolean;
      onCheckedChange: (checked: boolean) => void;
    }
  | {
      type: "custom";
      pinned: true;
      render: (context: EntityDetailHeaderActionContext) => React.ReactNode;
    }
);

type CloseHeaderAction = Extract<
  EntityDetailHeaderAction,
  { type: "button" }
> & {
  id: "close";
  pinned: true;
};

export type EntityDetailHeaderConfiguration =
  | { variant: "page"; headerProps: EntityDetailHeaderProps }
  | {
      variant: "peek";
      headerProps: EntityDetailHeaderTitleProps & {
        actions: readonly [...EntityDetailHeaderAction[], CloseHeaderAction];
      };
    };

export type ObservabilityEntityDetailHeaderProps =
  EntityDetailHeaderConfiguration & {
    metrics: readonly HeaderMetric[];
    isPlaceholderData?: boolean;
    isLoading?: boolean;
  };

export function ObservabilityEntityDetailHeader({
  metrics,
  isPlaceholderData = false,
  isLoading = false,
  ...header
}: ObservabilityEntityDetailHeaderProps) {
  const stale = staleProps(isPlaceholderData);
  const content = (
    <div
      className={cn(
        "flex min-w-0 px-4 pt-0 pb-2",
        !isLoading && stale.className,
      )}
      inert={!isLoading && stale.inert}
      role="group"
      aria-label="Entity metrics"
      aria-busy={isLoading || undefined}
    >
      {isLoading ? (
        <EntityMetricsSkeleton />
      ) : (
        <EntityMetrics metrics={metrics} />
      )}
    </div>
  );
  return (
    <EntityDetailHeaderChrome {...header}>
      {isLoading || metrics.length > 0 ? content : undefined}
    </EntityDetailHeaderChrome>
  );
}

function EntityMetricsSkeleton() {
  return (
    <CollapsibleBadgeRow>
      {["w-16", "w-14", "w-24", "w-20", "w-40"].map((width) => (
        <Metric key={width}>
          <Skeleton className={`h-3 ${width}`} />
        </Metric>
      ))}
    </CollapsibleBadgeRow>
  );
}

// Reserve enough title width before folding controls, including planner safety gaps.
const MIN_TITLE_PX = 240;
const TILE_PX = 32;
const HEADER_SPACING_PX = 56;

function EntityDetailHeaderChrome({
  headerProps,
  variant,
  children,
}: EntityDetailHeaderConfiguration & {
  children?: React.ReactNode;
}) {
  const {
    title,
    itemType,
    titleTabs,
    titleTooltip,
    titleBadges,
    titleLevel,
    actions = [],
  } = headerProps;
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [headerRef, headerSize] = useElementSize<HTMLDivElement>();
  // Controls can resize as data loads without changing the available header width.
  const [clusterRef, clusterSize] = useElementSize<HTMLDivElement>();
  const [titleTabsRef, titleTabsSize] = useElementSize<HTMLDivElement>();
  const hasTitleTabs = Boolean(titleTabs);
  const actionsRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  // Folded controls cannot be measured, so retain their last visible widths.
  const widthsRef = useRef<{ labels?: number; icons?: number }>({});
  const actionLayoutKey = JSON.stringify(
    actions.map((action) => {
      if (action.type === "custom")
        return [action.id, action.type, action.pinned];
      if (action.type === "checkbox")
        return [action.id, action.type, action.label];
      return [
        action.id,
        action.type,
        action.pinned,
        action.label,
        action.iconOnly,
        action.type === "button" ? action.count : undefined,
        action.type === "dropdown" ? action.placement : undefined,
      ];
    }),
  );
  const measuredActions = useRef(actionLayoutKey);
  const [actionPresentation, setActionPresentation] = useState<
    "labels" | "icons" | "menu"
  >("labels");
  const overflowActions = actions.filter(
    (
      action,
    ): action is Extract<
      EntityDetailHeaderAction,
      { type: "button" | "dropdown" | "checkbox" }
    > => !action.pinned,
  );
  const toolbarActions = overflowActions.filter(
    (action) => action.type !== "dropdown" || action.placement !== "trailing",
  );
  const trailingActions = overflowActions.filter(
    (action) => action.type === "dropdown" && action.placement === "trailing",
  );
  const pinnedActions = actions.filter((action) => action.pinned);
  const hasActions = overflowActions.length > 0;

  useLayoutEffect(() => {
    if (measuredActions.current !== actionLayoutKey) {
      measuredActions.current = actionLayoutKey;
      widthsRef.current = {};
      if (actionPresentation !== "labels" && !isMenuOpen) {
        setActionPresentation("labels");
        return;
      }
    }
    if (isMenuOpen) return;
    if (
      actionPresentation !== "labels" &&
      widthsRef.current.labels === undefined
    ) {
      setActionPresentation("labels");
      return;
    }
    const width =
      headerRef.current?.getBoundingClientRect().width ?? headerSize?.width;
    if (!width) return;
    if (!hasActions || !width) return;
    if (actionPresentation !== "menu" && actionsRef.current) {
      widthsRef.current[actionPresentation] =
        actionsRef.current.offsetWidth +
        (trailingRef.current?.offsetWidth ?? 0);
    }
    const tileWidth = hasTitleTabs
      ? (titleTabsRef.current?.getBoundingClientRect().width ??
        titleTabsSize?.width ??
        TILE_PX * 2)
      : TILE_PX;
    const availableWidth =
      width -
      MIN_TITLE_PX -
      tileWidth -
      (pinnedRef.current?.offsetWidth ?? 0) -
      (closeRef.current?.offsetWidth ?? 0) -
      HEADER_SPACING_PX;
    if (
      widthsRef.current.labels !== undefined &&
      widthsRef.current.labels <= availableWidth
    ) {
      setActionPresentation("labels");
      return;
    }
    // Measure the icon presentation before deciding whether it needs overflow.
    if (
      widthsRef.current.icons === undefined ||
      widthsRef.current.icons <= availableWidth
    ) {
      setActionPresentation("icons");
      return;
    }
    setActionPresentation("menu");
  }, [
    headerRef,
    headerSize?.width,
    clusterSize?.width,
    hasActions,
    actionPresentation,
    actionLayoutKey,
    isMenuOpen,
    hasTitleTabs,
    titleTabsRef,
    titleTabsSize?.width,
  ]);

  const renderAction = (
    action: EntityDetailHeaderAction,
    layout: "toolbar",
  ) => {
    const iconOnly = actionPresentation === "icons";
    if (action.type === "custom") return action.render({ layout, iconOnly });
    if (action.type === "checkbox")
      return (
        <label className="flex items-center gap-2">
          <span className="text-sm">{action.label}</span>
          <Switch
            checked={action.checked}
            onCheckedChange={action.onCheckedChange}
            size="sm"
          />
        </label>
      );
    const Icon = action.icon;
    const icon =
      action.type === "button" && action.isLoading ? (
        <Loader2 size="base" __rawClassName="animate-spin" />
      ) : (
        <Icon size="base" />
      );
    if (action.type === "dropdown")
      return (
        <DropdownMenu
          items={action.items}
          placement="bottom-start"
          maxHeight="24rem"
        >
          {({ getTriggerProps }) => {
            return (
              <HeaderActionButton
                {...getTriggerProps()}
                label={action.label}
                icon={icon}
                count={action.count}
                showLabel={!action.iconOnly && !iconOnly}
                disabled={action.disabled}
              />
            );
          }}
        </DropdownMenu>
      );
    if (action.type !== "button") return assertUnreachable(action);
    return (
      <HeaderActionButton
        label={action.label}
        icon={icon}
        count={action.count}
        showLabel={!action.iconOnly && !iconOnly}
        disabled={action.disabled}
        onClick={action.onClick}
      />
    );
  };
  const overflowItems = overflowActions.flatMap<DropdownMenuItemDefinition>(
    (action) => {
      if (action.type === "checkbox")
        return [
          {
            type: "checkbox",
            id: action.id,
            title: action.label,
            checked: action.checked,
            onCheckedChange: action.onCheckedChange,
          },
        ];
      const disabled = action.disabled
        ? { reason: "Action unavailable" }
        : undefined;
      if (action.type === "dropdown") {
        if (action.placement === "trailing" && !action.disabled)
          return action.items;
        return [
          {
            type: "submenu",
            id: action.id,
            title: action.label,
            icon: action.icon,
            disabled,
            items: action.items,
            count: action.count,
          },
        ];
      }
      if (action.type !== "button") return assertUnreachable(action);
      return [
        {
          type: "item",
          id: action.id,
          title: action.label,
          icon: action.icon,
          disabled,
          badge: (action.isLoading || !!action.count) && (
            <>
              {action.isLoading && (
                <Loader2 size="base" __rawClassName="animate-spin" />
              )}
              {!!action.count && <Badge text={String(action.count)} />}
            </>
          ),
          onClick: action.onClick,
        },
      ];
    },
  );
  return (
    <header
      className={cn("shrink-0", children != null && "border-b")}
      aria-label={`${variant === "peek" ? "Peek" : "Entity"} details`}
    >
      <div
        ref={headerRef}
        className="flex min-h-10 shrink-0 flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden pt-3 pr-4 pb-1.5 pl-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          {titleTabs && (
            <div ref={titleTabsRef} className="shrink-0">
              <EntityTitleTabs {...titleTabs} />
            </div>
          )}
          <EntityTitle
            as={variant === "page" ? "h2" : "span"}
            type={titleTabs ? undefined : itemType}
            title={title}
            level={titleLevel}
            tooltip={titleTooltip}
            isFocusable
          />
          {titleBadges}
        </div>
        <div
          ref={clusterRef}
          className="flex shrink-0 flex-row items-center gap-1"
        >
          {hasActions && actionPresentation !== "menu" ? (
            <div ref={actionsRef} className="flex flex-row items-center gap-1">
              {toolbarActions.map((action) => (
                <div key={action.id} className="flex items-center gap-1">
                  {renderAction(action, "toolbar")}
                </div>
              ))}
            </div>
          ) : null}
          {pinnedActions.some((action) => action.id !== "close") && (
            <div ref={pinnedRef} className="flex items-center gap-1">
              {pinnedActions
                .filter((action) => action.id !== "close")
                .map((action) => (
                  <div key={action.id} className="flex items-center">
                    {renderAction(action, "toolbar")}
                  </div>
                ))}
            </div>
          )}
          {actionPresentation !== "menu" && trailingActions.length > 0 && (
            <div ref={trailingRef} className="flex items-center gap-1">
              {trailingActions.map((action) => (
                <div key={action.id}>{renderAction(action, "toolbar")}</div>
              ))}
            </div>
          )}
          {hasActions && actionPresentation === "menu" && (
            <ControlledDropdownMenu
              items={overflowItems}
              open={isMenuOpen}
              onOpenChange={setMenuOpen}
              placement="bottom-end"
              maxHeight="24rem"
            >
              {({ getTriggerProps }) => (
                <HeaderActionButton
                  {...getTriggerProps()}
                  label="More actions"
                  icon={<MoreVertical size="base" />}
                />
              )}
            </ControlledDropdownMenu>
          )}
          {pinnedActions.some((action) => action.id === "close") && (
            <div ref={closeRef} className="flex items-center gap-1">
              {pinnedActions
                .filter((action) => action.id === "close")
                .map((action) => (
                  <div key={action.id} className="flex items-center">
                    {renderAction(action, "toolbar")}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
      {children}
    </header>
  );
}

function MetricChip({ metric }: { metric: HeaderMetric }) {
  if (!metric.remove)
    return (
      <span className="ph-no-capture inline-flex max-w-full min-w-0">
        <MetricContent metric={metric} />
      </span>
    );
  return (
    <span className="ph-no-capture group inline-flex max-w-full min-w-0 items-center">
      <MetricContent metric={metric} />
      <span className="inline-flex w-0 overflow-hidden transition-[width,margin] group-focus-within:ml-1 group-focus-within:w-4 group-hover:ml-1 group-hover:w-4">
        <IconButton
          size="xs"
          label={metric.remove.label}
          icon={X}
          onClick={metric.remove.onClick}
        />
      </span>
    </span>
  );
}

function MetricContent({ metric }: { metric: HeaderMetric }) {
  if (metric.type === "missing-cost")
    return (
      <CostBadge
        variant="missing"
        projectId={metric.projectId}
        hasUsage={metric.hasUsage}
      />
    );
  if (metric.type === "missing-usage")
    return (
      <UsageCostWarningBadge
        projectId={metric.projectId}
        label="usage not submitted"
        description="No token usage was submitted for this generation. Send token usage and a model name, or submit costs directly."
      />
    );
  if (metric.type === "model")
    return (
      <button
        type="button"
        title="Create model definition"
        className="inline-flex cursor-pointer font-mono"
        onClick={metric.onCreate}
      >
        <Metric interactive value={metric.model} />
      </button>
    );
  if (metric.type === "value")
    return metric.color ? (
      <Badge
        color={metric.color}
        text={metric.text}
        label={metric.label}
        title={metric.title}
        leadingIcon={metric.leadingIcon}
      />
    ) : (
      <Metric
        value={metric.text}
        label={metric.label}
        title={metric.title}
        icon={metric.leadingIcon}
      />
    );
  if (metric.type === "link")
    return (
      <Metric
        href={metric.href}
        value={metric.text}
        label={metric.label}
        newTab={metric.newTab}
        noCapture
      />
    );
  if (metric.type === "score")
    return <ScoreBadge name={metric.name} scores={metric.scores} />;
  if (metric.type === "correction") return <CorrectionBadge />;
  if (metric.type === "cost" || metric.type === "tokens")
    return (
      <BreakdownTooltip
        details={metric.details}
        isCost={metric.type === "cost"}
        costSource={metric.type === "cost" ? metric.costSource : undefined}
        priceSource={metric.type === "cost" ? metric.priceSource : undefined}
      >
        <Metric interactive value={metric.text} title={metric.title} />
      </BreakdownTooltip>
    );
  if (metric.type === "action")
    return (
      <Tooltip label={metric.label}>
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps({ ref: metric.triggerRef })}
            label={metric.label}
            icon={metric.icon}
            size="sm"
            onClick={metric.onClick}
          />
        )}
      </Tooltip>
    );
  if (metric.type === "details")
    return (
      <HoverCard
        placement="bottom-end"
        content={
          <div className="ph-no-capture flex max-h-[70vh] w-120 flex-col overflow-y-auto px-4">
            <div className="flex items-center justify-between gap-2 border-b py-2.5">
              <span className="text-sm font-bold">{metric.title}</span>
              <Metric href={metric.href} value={metric.linkText} />
            </div>
            {metric.rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-1.5 border-b py-3 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-sm">
                    {row.label}
                  </span>
                  <Badge text={row.value} color={row.color} />
                </div>
                {row.description && (
                  <p className="text-sm text-pretty">{row.description}</p>
                )}
              </div>
            ))}
          </div>
        }
      >
        {({ getTriggerProps }) => (
          <span {...getTriggerProps()}>
            <Metric interactive value={metric.text} />
          </span>
        )}
      </HoverCard>
    );
  return assertUnreachable(metric);
}

const PAGE_SIZE = 20;

function EntityMetrics({ metrics }: { metrics: readonly HeaderMetric[] }) {
  const [search, setSearch] = useState("");
  const [isOverflowOpen, setOverflowOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const actions = metrics.filter((metric) => metric.type === "action");
  const values = metrics.filter((metric) => metric.type !== "action");
  const inlineCandidates = values.filter((metric) => !metric.overflowOnly);
  const inlineMetrics = inlineCandidates.slice(0, PAGE_SIZE);
  const remainingMetrics = [
    ...inlineCandidates.slice(PAGE_SIZE),
    ...values.filter((metric) => metric.overflowOnly),
  ];
  return (
    <SingleLineOverflowList
      spacing="comfortable"
      items={inlineMetrics}
      additionalOverflowCount={remainingMetrics.length}
      getKey={(metric) => metric.id}
      isTightItem={(metric) =>
        metric.type === "score" ||
        metric.type === "correction" ||
        (metric.type === "value" && metric.color === "filled")
      }
      renderItem={(metric) => (
        <span data-entity-metric="true" className="inline-flex min-w-0">
          <MetricChip metric={metric} />
        </span>
      )}
      trailingContent={
        actions.length > 0 ? (
          <div className="flex items-center gap-1">
            {actions.map((metric) => (
              <MetricChip key={metric.id} metric={metric} />
            ))}
          </div>
        ) : undefined
      }
      renderOverflow={({ hiddenItems, overflowItemCount }) => {
        const normalizedSearch = search.trim().toLocaleLowerCase();
        const filteredMetrics = [...hiddenItems, ...remainingMetrics].filter(
          (metric) =>
            metric.searchText.toLocaleLowerCase().includes(normalizedSearch),
        );
        return (
          <FloatingController
            interaction="click"
            placement="bottom-end"
            open={isOverflowOpen}
            onOpenChange={(open) => {
              setOverflowOpen(open);
              if (open) return;
              setSearch("");
              setVisibleCount(PAGE_SIZE);
            }}
            renderContent={(floatingProps) => (
              <div
                {...floatingProps}
                className="ph-no-capture bg-popover text-popover-foreground w-80 rounded-md border shadow-md outline-hidden"
                aria-label="All entity details"
              >
                <div className="relative border-b p-2">
                  <Search
                    size="base"
                    color="muted"
                    __rawClassName="absolute top-1/2 left-4 -translate-y-1/2"
                  />
                  <Input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    placeholder="Search details"
                    aria-label="Search details"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div
                  role="region"
                  aria-label="Detail results"
                  className="flex max-h-72 flex-col items-start gap-2 overflow-y-auto p-2"
                  onScroll={(event) => {
                    const element = event.currentTarget;
                    if (
                      element.scrollHeight -
                        element.scrollTop -
                        element.clientHeight >
                      16
                    )
                      return;
                    setVisibleCount((current) =>
                      Math.min(current + PAGE_SIZE, filteredMetrics.length),
                    );
                  }}
                >
                  {filteredMetrics.slice(0, visibleCount).map((metric) => (
                    <span
                      key={metric.id}
                      className="flex max-w-full items-center"
                    >
                      <MetricChip metric={metric} />
                    </span>
                  ))}
                  {filteredMetrics.length === 0 && (
                    <p className="text-muted-foreground px-2 py-4 text-xs">
                      No details found.
                    </p>
                  )}
                </div>
              </div>
            )}
          >
            {({ getTriggerProps }) => (
              <OverflowCountBadge
                {...getTriggerProps()}
                count={overflowItemCount}
                aria-label={`Show ${overflowItemCount} more details`}
              />
            )}
          </FloatingController>
        );
      }}
    />
  );
}
