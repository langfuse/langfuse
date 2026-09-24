/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";

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
  shouldWrap,
  ...options
}: BadgeListTableColumnOptions<TData> & {
  nullValue?: string;
  shouldWrap: boolean;
}) {
  return createTableColumn<TData, string[]>({
    ...options,
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (values, context) => {
      if (!values?.length) return nullValue ?? null;

      return (
        <div className={cn("flex gap-1", shouldWrap && "flex-wrap")}>
          {values.map((value, index) => {
            const badge =
              range === "semantic" || range === "decorative"
                ? getBadge(value, context)
                : (getBadge?.(value, context) ?? {
                    value,
                    variant: "secondary",
                  });
            const Icon = badge.icon;

            return (
              <Badge
                key={`${value}-${index}`}
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
          })}
        </div>
      );
    },
  });
}
