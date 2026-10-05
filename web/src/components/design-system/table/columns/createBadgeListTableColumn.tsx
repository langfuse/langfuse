/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";

import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Badge, type BadgeProps } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;
type SemanticBadgeVariant = Extract<
  BadgeVariant,
  "destructive" | "error" | "success" | "warning"
>;
type DecorativeBadgeVariant = Extract<
  BadgeVariant,
  | "blue"
  | "violet"
  | "teal"
  | "emerald"
  | "purple"
  | "pink"
  | "orange"
  | "amber"
  | "green"
>;
type NeutralBadgeVariant = Extract<
  BadgeVariant,
  "default" | "secondary" | "tertiary"
>;

type GetBadge<TData extends RowData, TItem, TVariant extends BadgeVariant> = (
  value: TItem,
  context: CellContext<TData, TItem[] | null | undefined>,
) => {
  value: string;
  variant: TVariant;
  icon?:
    | LucideIcon
    | React.ElementType<{ className?: string; "aria-hidden"?: boolean }>;
  ariaLabel?: string;
} & ([TItem] extends [string] ? { key?: string } : { key: string });

type BadgeListTableColumnOptions<
  TData extends RowData,
  TItem,
> = TableColumnOptions<TData, TItem[]> &
  (
    | {
        range: "decorative";
        getBadge: GetBadge<TData, TItem, DecorativeBadgeVariant>;
      }
    | ({
        range?: "neutral";
      } & ([TItem] extends [string]
        ? { getBadge?: GetBadge<TData, TItem, NeutralBadgeVariant> }
        : { getBadge: GetBadge<TData, TItem, NeutralBadgeVariant> }))
    | {
        range: "semantic";
        getBadge: GetBadge<TData, TItem, SemanticBadgeVariant>;
      }
  );

export function createBadgeListTableColumn<
  TData extends RowData,
  TItem = string,
>({
  getBadge,
  nullValue,
  range,
  ...options
}: BadgeListTableColumnOptions<TData, TItem> & {
  nullValue?: string;
}) {
  return createTableColumn<TData, TItem[]>({
    ...options,
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (values, context) => {
      if (!values?.length) return nullValue ?? null;

      const badges = values.map((value, index) => ({
        key: String(index),
        ...(range === "semantic" || range === "decorative"
          ? getBadge(value, context)
          : (getBadge?.(value, context) ?? {
              value: String(value),
              variant: "secondary" as const,
              icon: undefined,
              ariaLabel: undefined,
            })),
      }));
      const renderBadge = (badge: (typeof badges)[number]) => {
        const Icon = badge.icon;
        return (
          <Badge
            variant={badge.variant}
            className="max-w-fit gap-1 truncate rounded-sm px-1 font-normal"
            title={badge.value}
            aria-label={badge.ariaLabel}
          >
            {Icon && <Icon className="size-3 shrink-0" aria-hidden />}
            <span className="truncate leading-normal" title={badge.value}>
              {badge.value}
            </span>
          </Badge>
        );
      };

      return (
        <SingleLineOverflowList
          items={badges}
          additionalOverflowCount={0}
          getKey={(badge) => badge.key}
          renderItem={renderBadge}
          renderOverflow={({ hiddenItems, overflowItemCount }) => (
            <CustomTooltip
              content={
                <div
                  className={cn(
                    "flex flex-wrap gap-1",
                    options.sensitive && "ph-no-capture",
                  )}
                >
                  {hiddenItems.map((badge) => (
                    <span key={badge.key}>{renderBadge(badge)}</span>
                  ))}
                </div>
              }
            >
              {({ getTriggerProps }) => (
                <span
                  {...getTriggerProps()}
                  className="inline-flex"
                  tabIndex={0}
                >
                  <Badge variant="secondary">+{overflowItemCount}</Badge>
                </span>
              )}
            </CustomTooltip>
          )}
        />
      );
    },
  });
}
