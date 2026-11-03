/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";
import { type IconComponent } from "@langfuse/icons";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";
import {
  badgeVariantToColor,
  type BadgeVariant,
} from "./utils/badgeVariantColor";

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

type GetBadge<
  TData extends RowData,
  TVariant extends BadgeVariant | "unknown",
> = (
  value: string,
  context: CellContext<TData, string | null | undefined>,
) => {
  value: string;
  variant: TVariant;
  icon?: IconComponent;
};

type BadgeTableColumnOptions<TData extends RowData> =
  | (TableColumnOptions<TData, string> & {
      range: "decorative";
      getBadge: GetBadge<TData, DecorativeBadgeVariant>;
    })
  | (TableColumnOptions<TData, string> & {
      range?: "neutral";
      getBadge?: GetBadge<TData, NeutralBadgeVariant>;
    })
  | (TableColumnOptions<TData, string> & {
      range: "semantic";
      getBadge: GetBadge<TData, SemanticBadgeVariant | "unknown">;
    });

export function createBadgeTableColumn<TData extends RowData>({
  getBadge,
  nullValue,
  range,
  ...options
}: BadgeTableColumnOptions<TData> & { nullValue?: string }) {
  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (value, context) => {
      if (!value) {
        return nullValue ? (
          <span className="block w-full truncate" title={nullValue}>
            {nullValue}
          </span>
        ) : null;
      }

      const badge =
        range === "semantic" || range === "decorative"
          ? getBadge(value, context)
          : (getBadge?.(value, context) ?? { value, variant: "secondary" });

      return (
        <Badge
          color={badgeVariantToColor(
            badge.variant === "unknown"
              ? "default"
              : (badge.variant ?? "secondary"),
          )}
          size="md"
          text={badge.value}
          leadingIcon={badge.icon}
        />
      );
    },
  });
}
