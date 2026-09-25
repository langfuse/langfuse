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

type GetBadge<TData extends RowData, TVariant extends BadgeVariant> = (
  value: string,
  context: CellContext<TData, string[] | null | undefined>,
) => {
  value: string;
  variant: TVariant;
  icon?: LucideIcon;
};

type BadgeListTableColumnOptions<TData extends RowData> =
  | (TableColumnOptions<TData, string[]> & {
      range: "decorative";
      getBadge: GetBadge<TData, DecorativeBadgeVariant>;
    })
  | (TableColumnOptions<TData, string[]> & {
      range?: "neutral";
      getBadge?: GetBadge<TData, NeutralBadgeVariant>;
    })
  | (TableColumnOptions<TData, string[]> & {
      range: "semantic";
      getBadge: GetBadge<TData, SemanticBadgeVariant>;
    });

export function createBadgeListTableColumn<TData extends RowData>({
  getBadge,
  nullValue,
  range,
  ...options
}: BadgeListTableColumnOptions<TData> & {
  nullValue?: string;
}) {
  return createTableColumn<TData, string[]>({
    ...options,
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (values, context) => {
      if (!values?.length) return nullValue ?? null;

      const badges = values.map((value, index) => ({
        key: String(index),
        ...(range === "semantic" || range === "decorative"
          ? getBadge(value, context)
          : (getBadge?.(value, context) ?? {
              value,
              variant: "secondary" as const,
            })),
      }));
      const renderBadge = (badge: (typeof badges)[number]) => {
        const Icon = badge.icon;
        return (
          <Badge
            variant={badge.variant}
            className="max-w-fit gap-1 truncate rounded-sm px-1 font-normal"
            title={badge.value}
          >
            {Icon && <Icon className="size-3 shrink-0" aria-hidden />}
            <span className="truncate" title={badge.value}>
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
